import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { EmailMessage } from '@meeting-assistant/shared';
import { applyAuthEnv, configureMockUser, startMockOidc, startPostgres, type TestStack } from '../test/harness.js';
import { recordAudit } from '../lib/audit.js';
import { resetPools, withTenant } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';
import { createCapturingEmailAdapter, setEmailAdapter } from '../lib/email.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const LUMEN = '00000000-0000-0000-0000-000000000001';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
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

    const sent = activity.body.items.find((item: { action: string; metadata?: { email?: string } }) => {
      return item.action === 'invite.sent' && item.metadata?.email === 'audit.invite@example.com';
    });
    expect(JSON.stringify(sent)).not.toMatch(/token/i);
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
    expect(
      acmeActivity.body.items.some(
        (item: { metadata?: { email?: string } }) => item.metadata?.email === 'audit.cross@example.com'
      )
    ).toBe(true);

    await withTenant(LUMEN, async (client) => {
      const visible = await client.query<{ email: string | null }>(
        `SELECT metadata->>'email' AS email FROM audit_events WHERE metadata->>'email' = $1`,
        ['audit.cross@example.com']
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
});
