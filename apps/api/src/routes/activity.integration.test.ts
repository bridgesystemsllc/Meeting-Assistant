import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { EmailMessage } from '@meeting-assistant/shared';
import { applyAuthEnv, configureMockUser, startMockOidc, startPostgres, type TestStack } from '../test/harness.js';
import { purgeAuditTenant, purgeAuditUser, recordAudit } from '../lib/audit.js';
import { getAppPool, getOwnerPool, resetPools, withTenant } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';
import { createCapturingEmailAdapter, setEmailAdapter } from '../lib/email.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const LUMEN = '00000000-0000-0000-0000-000000000001';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const LUMEN_OWNER = '00000000-0000-0000-0000-000000000002';
const MEMBERSHIP_MEMBER = '00000000-0000-0000-0000-000000000024';

function tokenFrom(message: EmailMessage | undefined): string {
  expect(message?.acceptUrl).toBeTruthy();
  const url = new URL(message!.acceptUrl!);
  const token = url.pathname.split('/').pop();
  expect(token).toBeTruthy();
  return token!;
}

describe('activity integration', () => {
  let stack: Omit<TestStack, 'mockOidc' | 'issuerUrl'> & {
    mockOidc: Awaited<ReturnType<typeof startMockOidc>>['server'];
    issuerUrl: string;
  };
  let apiPort: number;
  let apiServer: { close: () => Promise<void> } | undefined;
  const inbox: EmailMessage[] = [];

  beforeAll(async () => {
    const pgStack = await startPostgres();
    const mock = await startMockOidc();
    stack = { ...pgStack, mockOidc: mock.server, issuerUrl: mock.issuerUrl };
    applyAuthEnv({ ownerUrl: pgStack.ownerUrl, appUrl: pgStack.appUrl, issuerUrl: mock.issuerUrl });
    process.env.PG_POOL_MAX = '4';
    process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
    await resetPools();
    clearOidcCache();
    setEmailAdapter(createCapturingEmailAdapter(inbox));

    const { createApp } = await import('../app.js');
    apiServer = await new Promise((resolve) => {
      const server = createApp().listen(0, '127.0.0.1', () => {
        const addr = server.address();
        apiPort = typeof addr === 'object' && addr ? addr.port : 0;
        process.env.OIDC_REDIRECT_BASE = `http://127.0.0.1:${apiPort}`;
        resolve({
          close: () =>
            new Promise<void>((r, j) => {
              server.close((err) => (err ? j(err) : r()));
            }),
        });
      });
    });
  }, 120_000);

  afterAll(async () => {
    await apiServer?.close();
    await stack?.mockOidc.stop();
    await resetPools();
    await stack?.container.stop();
  }, 60_000);

  beforeEach(() => {
    inbox.length = 0;
  });

  function origin(): string {
    return `http://127.0.0.1:${apiPort}`;
  }

  async function login(email: string, name: string) {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email, name });
    const agent = request.agent(origin());
    const start = await agent.get('/api/v1/auth/login/google').redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await agent.get(callback.pathname + callback.search).redirects(0);
    expect(done.status).toBe(302);
    return agent;
  }

  async function loginWithInvite(email: string, name: string, token: string) {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email, name });
    const agent = request.agent(origin());
    const start = await agent.get('/api/v1/auth/login/google').query({ invite: token }).redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    return agent.get(callback.pathname + callback.search).redirects(0);
  }

  it('writes events for login, logout, invites, and membership changes', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');

    const invited = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'audit.invite@example.com',
      role: 'member',
    });
    expect(invited.status).toBe(201);
    const inviteId = invited.body.invites.find((i: { email: string }) => i.email === 'audit.invite@example.com')
      ?.id as string;

    const resent = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/resend`);
    expect(resent.status).toBe(200);
    const revoked = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/revoke`);
    expect(revoked.status).toBe(200);

    const acceptInvite = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'audit.accept@example.com',
      role: 'member',
    });
    expect(acceptInvite.status).toBe(201);
    const token = tokenFrom(inbox.at(-1));
    const accepted = await loginWithInvite('audit.accept@example.com', 'Audit Accept', token);
    expect(accepted.status).toBe(302);

    const deactivated = await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
    expect(deactivated.status).toBe(200);
    const reactivated = await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
    expect(reactivated.status).toBe(200);

    await admin.post('/api/v1/auth/logout').set('Accept', 'application/json');
    const adminAgain = await login('owner@example.com', 'Avery Owner');
    const activity = await adminAgain.get('/api/v1/tenant/activity').query({ limit: 100 });
    expect(activity.status).toBe(200);

    const actions = activity.body.items.map((item: { action: string }) => item.action);
    for (const action of [
      'login',
      'logout',
      'invite.sent',
      'invite.resent',
      'invite.revoked',
      'invite.accepted',
      'member.deactivated',
      'member.reactivated',
    ]) {
      expect(actions, action).toContain(action);
    }

    const sent = activity.body.items.find((item: { action: string; metadata?: { email_masked?: string } }) => {
      return item.action === 'invite.sent' && item.metadata?.email_masked === 'a***@example.com';
    });
    expect(JSON.stringify(sent)).not.toMatch(/token/i);
    expect(JSON.stringify(sent)).not.toContain('audit.invite@example.com');
    expect(JSON.stringify(activity.body)).not.toMatch(/email_hmac/i);
    expect(sent.actor.email).toBe('owner@example.com');
  });

  it('returns 403 FORBIDDEN for a member and hides other tenants', async () => {
    const member = await login('member@example.com', 'Morgan Member');
    const forbidden = await member.get('/api/v1/tenant/activity');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const acme = await login('owner@example.com', 'Avery Owner');
    const created = await acme.post('/api/v1/tenant/seats/invite').send({
      email: 'audit.cross@example.com',
      role: 'member',
    });
    expect(created.status).toBe(201);

    const lumen = await login('dev@example.com', 'Dev User');
    const lumenActivity = await lumen.get('/api/v1/tenant/activity').query({ limit: 100 });
    expect(lumenActivity.status).toBe(200);
    const emails = JSON.stringify(lumenActivity.body.items);
    expect(emails).not.toContain('audit.cross@example.com');
    expect(emails).not.toContain('audit.invite@example.com');

    const acmeActivity = await acme.get('/api/v1/tenant/activity').query({ action: 'invite.sent', limit: 100 });
    const acmeIds = new Set(
      (acmeActivity.body.items as { id: string; metadata?: { email_masked?: string } }[]).map((item) => item.id)
    );
    expect(
      acmeActivity.body.items.some(
        (item: { metadata?: { email_masked?: string } }) => item.metadata?.email_masked === 'a***@example.com'
      )
    ).toBe(true);

    const lumenIds = (lumenActivity.body.items as { id: string }[]).map((item) => item.id);
    expect(lumenIds.some((id) => acmeIds.has(id))).toBe(false);

    const hashed = await getOwnerPool().query(
      `SELECT id FROM audit_events WHERE tenant_id = $1 AND action = 'invite.sent' AND email_masked = $2`,
      [ACME, 'a***@example.com']
    );
    expect(hashed.rowCount).toBeGreaterThan(0);

    await withTenant(LUMEN, async (client) => {
      const visible = await client.query(
        `SELECT 1 FROM audit_events WHERE email_masked IS NOT NULL AND email_hmac IS NOT NULL`
      );
      expect(visible.rowCount).toBe(0);

      await expect(
        client.query(`INSERT INTO audit_events (tenant_id, action) VALUES ($1, 'login')`, [ACME])
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('paginates newest first and blocks UPDATE/DELETE for the app role', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    await withTenant(ACME, async (client) => {
      for (let i = 0; i < 3; i += 1) {
        await recordAudit(client, {
          actorUserId: ACME_OWNER,
          action: 'branding.updated',
          targetType: 'tenant',
          targetId: ACME,
          metadata: { n: i },
        });
      }
    });

    const page1 = await admin.get('/api/v1/tenant/activity').query({
      action: 'branding.updated',
      limit: 2,
    });
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const firstIds = page1.body.items.map((item: { id: string }) => item.id);

    const page2 = await admin.get('/api/v1/tenant/activity').query({
      action: 'branding.updated',
      limit: 2,
      cursor: page1.body.nextCursor,
    });
    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBeGreaterThanOrEqual(1);
    expect(page2.body.items.every((item: { id: string }) => !firstIds.includes(item.id))).toBe(true);
    const page2Times = page2.body.items.map((item: { created_at: string }) => item.created_at);
    expect(page2Times[0] <= page1.body.items[page1.body.items.length - 1].created_at).toBe(true);

    const overLimit = await admin.get('/api/v1/tenant/activity').query({ limit: 1000 });
    expect(overLimit.status).toBe(200);
    expect(overLimit.body.items.length).toBeLessThanOrEqual(100);

    await withTenant(ACME, async (client) => {
      await expect(client.query(`UPDATE audit_events SET action = 'logout'`)).rejects.toThrow();
      await expect(client.query(`DELETE FROM audit_events`)).rejects.toThrow();
      await expect(client.query('TRUNCATE audit_events')).rejects.toThrow();
    });

    const stillThere = await admin.get('/api/v1/tenant/activity').query({
      action: 'branding.updated',
      limit: 100,
    });
    expect(stillThere.body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('returns 400 for a bad cursor without leaking SQLSTATE', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const junk = await admin.get('/api/v1/tenant/activity').query({ cursor: 'not-a-cursor' });
    expect(junk.status).toBe(400);
    expect(junk.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(junk.body)).not.toMatch(/SQLSTATE|22P02|invalid input syntax/i);

    const badUuid = Buffer.from(JSON.stringify({ createdAt: '2026-11-10T00:00:00.000Z', id: 'nope' })).toString(
      'base64url'
    );
    const invalid = await admin.get('/api/v1/tenant/activity').query({ cursor: badUuid });
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toMatch(/SQLSTATE|22P02|invalid input syntax/i);
  });

  it('emits meeting.deleted inside the delete transaction', async () => {
    const meetingId = '10000000-0000-0000-0000-00000000a001';
    await getOwnerPool().query(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
       VALUES ($1, $2, $3, 'Audit delete', 'meet', 'https://meet.google.com/aud-itde-lete', 'completed')`,
      [meetingId, ACME, ACME_OWNER]
    );
    const admin = await login('owner@example.com', 'Avery Owner');
    const deleted = await admin.delete(`/api/v1/meetings/${meetingId}`);
    expect(deleted.status).toBe(204);
    const activity = await admin.get('/api/v1/tenant/activity').query({ action: 'meeting.deleted', limit: 10 });
    expect(activity.body.items.some((item: { target_id: string }) => item.target_id === meetingId)).toBe(true);
  });

  it('treats concurrent revoke and deactivate as one state change and one audit row (200, no extra row on repeat)', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const invited = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'audit.concurrent@example.com',
      role: 'member',
    });
    expect(invited.status).toBe(201);
    const inviteId = invited.body.invites.find((i: { email: string }) => i.email === 'audit.concurrent@example.com')
      ?.id as string;

    const [firstRevoke, secondRevoke] = await Promise.all([
      admin.post(`/api/v1/tenant/seats/invites/${inviteId}/revoke`),
      admin.post(`/api/v1/tenant/seats/invites/${inviteId}/revoke`),
    ]);
    expect(firstRevoke.status).toBe(200);
    expect(secondRevoke.status).toBe(200);
    const thirdRevoke = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/revoke`);
    expect(thirdRevoke.status).toBe(200);

    const revoked = await admin.get('/api/v1/tenant/activity').query({ action: 'invite.revoked', limit: 100 });
    const revokeRows = revoked.body.items.filter(
      (item: { target_id: string }) => item.target_id === inviteId
    );
    expect(revokeRows).toHaveLength(1);

    await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
    const beforeDeact = await admin.get('/api/v1/tenant/activity').query({
      action: 'member.deactivated',
      limit: 100,
    });
    const beforeCount = (beforeDeact.body.items as { target_id: string }[]).filter(
      (item) => item.target_id === MEMBERSHIP_MEMBER
    ).length;

    const [firstDeact, secondDeact] = await Promise.all([
      admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`),
      admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`),
    ]);
    expect(firstDeact.status).toBe(200);
    expect(secondDeact.status).toBe(200);
    const repeatDeact = await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
    expect(repeatDeact.status).toBe(200);

    const deactivated = await admin.get('/api/v1/tenant/activity').query({
      action: 'member.deactivated',
      limit: 100,
    });
    const deactRows = (deactivated.body.items as { target_id: string }[]).filter(
      (item) => item.target_id === MEMBERSHIP_MEMBER
    );
    expect(deactRows).toHaveLength(beforeCount + 1);
  });

  it('writes failed-invite on email mismatch and keeps accept+audit in one transaction', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const invited = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'audit.mismatch@example.com',
      role: 'member',
    });
    expect(invited.status).toBe(201);
    const token = tokenFrom(inbox.at(-1));
    const mismatch = await loginWithInvite('other.person@example.com', 'Other Person', token);
    expect(mismatch.status).toBe(302);

    const failed = await admin.get('/api/v1/tenant/activity').query({ action: 'failed-invite', limit: 20 });
    expect(failed.body.items.length).toBeGreaterThanOrEqual(1);

    const client = await getAppPool().connect();
    let atomicInviteId = '';
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ACME]);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'audit.atomic@example.com', 'member', 'atomic-hash', now() + interval '1 day')
         RETURNING id`,
        [ACME]
      );
      atomicInviteId = inserted.rows[0].id;
      await recordAudit(client, {
        actorUserId: ACME_OWNER,
        action: 'invite.accepted',
        targetType: 'invite',
        targetId: atomicInviteId,
        email: 'audit.atomic@example.com',
      });
      const inTxn = await client.query(`SELECT 1 FROM audit_events WHERE target_id = $1`, [atomicInviteId]);
      expect(inTxn.rowCount).toBe(1);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await withTenant(ACME, async (tx) => {
      const gone = await tx.query(`SELECT 1 FROM invites WHERE id = $1`, [atomicInviteId]);
      expect(gone.rowCount).toBe(0);
      const auditGone = await tx.query(`SELECT 1 FROM audit_events WHERE target_id = $1`, [atomicInviteId]);
      expect(auditGone.rowCount).toBe(0);
    });
  });

  it('overwrites client created_at, rejects unknown actions, and requires actor membership', async () => {
    await withTenant(ACME, async (client) => {
      const stamped = await client.query<{ created_at: Date }>(
        `INSERT INTO audit_events (tenant_id, actor_user_id, action, created_at)
         VALUES ($1, $2, 'login', '2020-01-01T00:00:00Z')
         RETURNING created_at`,
        [ACME, ACME_OWNER]
      );
      expect(Math.abs(Date.now() - new Date(stamped.rows[0].created_at).getTime())).toBeLessThan(60_000);
    });

    await withTenant(ACME, async (client) => {
      await expect(
        client.query(`INSERT INTO audit_events (tenant_id, action) VALUES ($1, 'not-an-action')`, [ACME])
      ).rejects.toThrow();
    });

    await withTenant(ACME, async (client) => {
      await expect(
        client.query(
          `INSERT INTO audit_events (tenant_id, actor_user_id, action) VALUES ($1, $2, 'login')`,
          [ACME, LUMEN_OWNER]
        )
      ).rejects.toThrow(/not a member/i);
    });

    await withTenant(ACME, async (client) => {
      await recordAudit(client, { action: 'failed-login', actorUserId: LUMEN_OWNER, targetType: 'user' });
      await recordAudit(client, { action: 'failed-invite', targetType: 'invite' });
    });
  });

  it('lets owner purge for offboarding and user erasure; direct mutation without the flag still fails', async () => {
    const owner = getOwnerPool();
    const tenant = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug) VALUES ('Erase Co', 'erase-co') RETURNING id`
    );
    const tenantId = tenant.rows[0].id;
    await owner.query(`INSERT INTO audit_events (tenant_id, action) VALUES ($1, 'login')`, [tenantId]);
    await owner.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    const orphan = await owner.query(`SELECT 1 FROM audit_events WHERE tenant_id = $1`, [tenantId]);
    expect(orphan.rowCount).toBe(1);
    expect(await purgeAuditTenant(tenantId)).toBe(1);
    const purged = await owner.query(`SELECT 1 FROM audit_events WHERE tenant_id = $1`, [tenantId]);
    expect(purged.rowCount).toBe(0);

    const user = await owner.query<{ id: string }>(
      `INSERT INTO users (email, name) VALUES ('erase.user@example.com', 'Erase User') RETURNING id`
    );
    const userId = user.rows[0].id;
    await withTenant(ACME, async (client) => {
      await recordAudit(client, {
        actorUserId: userId,
        action: 'failed-login',
        targetType: 'user',
        targetId: userId,
      });
    });
    await owner.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const dangling = await owner.query(`SELECT actor_user_id FROM audit_events WHERE target_id = $1`, [userId]);
    expect(dangling.rows[0].actor_user_id).toBe(userId);
    await purgeAuditUser(userId);
    const after = await owner.query(`SELECT 1 FROM audit_events WHERE target_id = $1`, [userId]);
    expect(after.rowCount).toBe(0);

    await withTenant(ACME, async (client) => {
      await expect(client.query(`UPDATE audit_events SET action = 'logout'`)).rejects.toThrow(
        /append-only|permission denied/i
      );
    });
    await withTenant(ACME, async (client) => {
      await expect(client.query(`DELETE FROM audit_events`)).rejects.toThrow(/append-only|permission denied/i);
    });
    await expect(owner.query(`UPDATE audit_events SET action = 'logout'`)).rejects.toThrow(/append-only/i);
    await expect(getAppPool().query(`SELECT purge_audit_tenant($1)`, [ACME])).rejects.toThrow();
  });
});
