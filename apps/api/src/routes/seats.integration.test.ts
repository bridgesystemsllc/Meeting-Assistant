import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { EmailMessage } from '@meeting-assistant/shared';
import pg from 'pg';
import {
  applyAuthEnv,
  configureMockUser,
  startMockOidc,
  startPostgres,
  type TestStack,
} from '../test/harness.js';
import { getAppPool, resetPools, withTenant } from '../lib/db.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { clearOidcCache } from '../lib/oidc.js';
import { createCapturingEmailAdapter, createSmtpEmailAdapter, setEmailAdapter } from '../lib/email.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const LUMEN = '00000000-0000-0000-0000-000000000001';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const LUMEN_OWNER = '00000000-0000-0000-0000-000000000002';
const MEMBERSHIP_MEMBER = '00000000-0000-0000-0000-000000000024';
const LUMEN_MEMBER_SEAT = '00000000-0000-0000-0000-000000000026';

function tokenFrom(message: EmailMessage | undefined): string {
  expect(message?.acceptUrl).toBeTruthy();
  const url = new URL(message!.acceptUrl!);
  const token = url.pathname.split('/').pop();
  expect(token).toBeTruthy();
  return token!;
}

describe('seats integration', () => {
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

  it('lists members and pending invites for an admin', async () => {
    const agent = await login('owner@example.com', 'Avery Owner');
    const res = await agent.get('/api/v1/tenant/seats');
    expect(res.status).toBe(200);
    expect(res.body.seat_limit).toBe(10);
    expect(res.body.seats_used).toBeGreaterThanOrEqual(4);
    expect(res.body.members.some((m: { email: string }) => m.email === 'owner@example.com')).toBe(true);
    expect(res.body.members.find((m: { email: string }) => m.email === 'invited@example.com')?.seat_status).toBe(
      'invited'
    );
  });

  it('invite lifecycle: send, capture email, accept via OIDC, membership created', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const before = await admin.get('/api/v1/tenant/seats');
    const used = before.body.seats_used as number;

    const created = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'jordan@example.com',
      role: 'member',
    });
    expect(created.status).toBe(201);
    expect(created.body.seats_used).toBe(used + 1);
    expect(created.body.invites.some((i: { email: string }) => i.email === 'jordan@example.com')).toBe(true);
    expect(created.body.members.some((m: { email: string }) => m.email === 'jordan@example.com')).toBe(false);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toBe('jordan@example.com');
    expect(inbox[0].acceptUrl).toContain('/invite/');
    expect(inbox[0].acceptUrl).toContain('tenant=acme-notes');
    expect(JSON.stringify(inbox[0])).not.toContain('token_hash');

    const token = tokenFrom(inbox[0]);
    const preview = await request(origin()).get(`/api/v1/auth/invites/${token}`).query({ tenant: 'acme-notes' });
    expect(preview.status).toBe(200);
    expect(preview.body.tenant.slug).toBe('acme-notes');

    const accepted = await loginWithInvite('jordan@example.com', 'Jordan Invitee', token);
    expect(accepted.status).toBe(302);
    expect(accepted.headers.location).toMatch(/\/meetings/);

    const after = await admin.get('/api/v1/tenant/seats');
    expect(after.body.invites.some((i: { email: string }) => i.email === 'jordan@example.com')).toBe(false);
    const member = after.body.members.find((m: { email: string }) => m.email === 'jordan@example.com');
    expect(member?.seat_status).toBe('active');
    expect(member?.role).toBe('member');
    expect(after.body.seats_used).toBe(used + 1);
  });

  it('rejects a used or expired invite link', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    await admin.post('/api/v1/tenant/seats/invite').send({ email: 'used.link@example.com', role: 'member' });
    const token = tokenFrom(inbox[0]);
    const first = await loginWithInvite('used.link@example.com', 'Used Link', token);
    expect(first.status).toBe(302);
    expect(first.headers.location).toMatch(/\/meetings/);

    const reused = await loginWithInvite('used.link@example.com', 'Used Link', token);
    expect(reused.status).toBe(302);
    expect(reused.headers.location).toMatch(/error=invite_used/);

    const usedLookup = await request(origin()).get(`/api/v1/auth/invites/${token}`);
    expect(usedLookup.status).toBe(400);
    expect(usedLookup.body.error.code).toBe('INVITE_USED');

    await admin.post('/api/v1/tenant/seats/invite').send({ email: 'expired.link@example.com', role: 'member' });
    const expiredToken = tokenFrom(inbox.at(-1));
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query(
        `UPDATE invites SET expires_at = NOW() - INTERVAL '1 hour'
         WHERE email = 'expired.link@example.com'`
      );
    } finally {
      await ownerDb.end();
    }
    const expiredLookup = await request(origin()).get(`/api/v1/auth/invites/${expiredToken}`);
    expect(expiredLookup.status).toBe(400);
    expect(expiredLookup.body.error.code).toBe('INVITE_EXPIRED');
    const expiredLogin = await loginWithInvite('expired.link@example.com', 'Expired', expiredToken);
    expect(expiredLogin.headers.location).toMatch(/error=invite_expired/);
  });

  it('rejects a cross-tenant invite', async () => {
    const acme = await login('owner@example.com', 'Avery Owner');
    const created = await acme.post('/api/v1/tenant/seats/invite').send({
      email: 'cross.tenant@example.com',
      role: 'member',
    });
    expect(created.status).toBe(201);
    const inviteId = created.body.invites.find((i: { email: string }) => i.email === 'cross.tenant@example.com')
      ?.id as string;
    const token = tokenFrom(inbox[0]);

    const lumen = await login('dev@example.com', 'Dev User');
    const listed = await lumen.get('/api/v1/tenant/seats');
    expect(listed.status).toBe(200);
    expect(listed.body.invites.some((i: { email: string }) => i.email === 'cross.tenant@example.com')).toBe(false);

    const resend = await lumen.post(`/api/v1/tenant/seats/invites/${inviteId}/resend`);
    expect(resend.status).toBe(404);

    const wrongTenant = await request(origin())
      .get(`/api/v1/auth/invites/${token}`)
      .query({ tenant: 'lumen-vale' });
    expect(wrongTenant.status).toBe(400);
    expect(wrongTenant.body.error.code).toBe('INVITE_WRONG_TENANT');
  });

  it('returns 409 SEAT_LIMIT_REACHED at the limit', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const current = await admin.get('/api/v1/tenant/seats');
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query('UPDATE tenants SET seat_limit = $1 WHERE id = $2', [
        current.body.seats_used,
        ACME,
      ]);
      const res = await admin.post('/api/v1/tenant/seats/invite').send({
        email: 'over.limit@example.com',
        role: 'member',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SEAT_LIMIT_REACHED');
      expect(inbox.filter((m) => m.to === 'over.limit@example.com')).toHaveLength(0);
    } finally {
      await ownerDb.query('UPDATE tenants SET seat_limit = 10 WHERE id = $1', [ACME]);
      await ownerDb.end();
    }
  });

  it('returns 403 SEAT_INACTIVE for invited-not-accepted and deactivated users', async () => {
    const invited = await login('invited@example.com', 'Casey Invited');
    const me = await invited.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.seat_status).toBe('invited');
    const meetings = await invited.get('/api/v1/meetings');
    expect(meetings.status).toBe(403);
    expect(meetings.body.error.code).toBe('SEAT_INACTIVE');

    const admin = await login('owner@example.com', 'Avery Owner');
    const deactivated = await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
    expect(deactivated.status).toBe(200);
    expect(
      deactivated.body.members.find((m: { id: string }) => m.id === MEMBERSHIP_MEMBER)?.seat_status
    ).toBe('deactivated');

    const member = await login('member@example.com', 'Morgan Member');
    const blocked = await member.get('/api/v1/meetings');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('SEAT_INACTIVE');

    const reactivated = await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(
      reactivated.body.members.find((m: { id: string }) => m.id === MEMBERSHIP_MEMBER)?.seat_status
    ).toBe('active');
  });

  it('returns 403 FORBIDDEN when a member tries to invite', async () => {
    const member = await login('member@example.com', 'Morgan Member');
    const res = await member.post('/api/v1/tenant/seats/invite').send({
      email: 'nope@example.com',
      role: 'member',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('resends and revokes an invite; last owner cannot be deactivated', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const created = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'resend.me@example.com',
      role: 'member',
    });
    const inviteId = created.body.invites.find((i: { email: string }) => i.email === 'resend.me@example.com')
      ?.id as string;
    const firstToken = tokenFrom(inbox[0]);

    const resent = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/resend`);
    expect(resent.status).toBe(200);
    const secondToken = tokenFrom(inbox.at(-1));
    expect(secondToken).not.toBe(firstToken);
    const oldLookup = await request(origin()).get(`/api/v1/auth/invites/${firstToken}`);
    expect(oldLookup.body.error.code).toBe('INVALID_INVITE');

    const revoked = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/revoke`);
    expect(revoked.status).toBe(200);
    const revokedLookup = await request(origin()).get(`/api/v1/auth/invites/${secondToken}`);
    expect(revokedLookup.body.error.code).toBe('INVITE_REVOKED');

    const ownerRow = created.body.members.find((m: { email: string }) => m.email === 'owner@example.com');
    const lastOwner = await admin.post(`/api/v1/tenant/seats/${ownerRow.id}/deactivate`);
    expect(lastOwner.status).toBe(409);
    expect(lastOwner.body.error.code).toBe('LAST_OWNER');
  });

  it('returns 400 INVALID_ID for a malformed membership or invite id', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const badMember = await admin.post('/api/v1/tenant/seats/not-a-uuid/deactivate');
    expect(badMember.status).toBe(400);
    expect(badMember.body.error.code).toBe('INVALID_ID');
    const badInvite = await admin.post('/api/v1/tenant/seats/invites/nope/resend');
    expect(badInvite.status).toBe(400);
    expect(badInvite.body.error.code).toBe('INVALID_ID');
    const meetings = await admin.get('/api/v1/meetings/not-a-uuid');
    expect(meetings.status).toBe(400);
    expect(meetings.body.error.code).toBe('INVALID_ID');
  });

  it('scopes directory lookups to the caller tenant', async () => {
    const contacts = await withTenant(ACME, (client) =>
      client.query<{ lookup_users_contact: { id: string }[] }>(
        'SELECT lookup_users_contact($1) AS lookup_users_contact',
        [[ACME_OWNER, LUMEN_OWNER]]
      )
    );
    const ids = (contacts.rows[0]?.lookup_users_contact ?? []).map((row) => row.id);
    expect(ids).toContain(ACME_OWNER);
    expect(ids).not.toContain(LUMEN_OWNER);

    await expect(
      getAppPool().query('SELECT lookup_users_contact($1)', [[ACME_OWNER]])
    ).rejects.toThrow(/tenant required/);
  });

  it('does not restore a deactivated owner via a member invite', async () => {
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    const token = randomToken(32);
    const userId = '00000000-0000-0000-0000-000000000033';
    try {
      await ownerDb.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [userId, 'deactivated.owner@example.com', 'Dana Deactivated']
      );
      await ownerDb.query(
        `INSERT INTO memberships (tenant_id, user_id, role, seat_status)
         VALUES ($1, $2, 'owner', 'deactivated')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', seat_status = 'deactivated'`,
        [ACME, userId]
      );
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, $2, 'member', $3, NOW() + INTERVAL '1 day')`,
        [ACME, 'deactivated.owner@example.com', hashToken(token)]
      );
    } finally {
      await ownerDb.end();
    }

    const attempt = await loginWithInvite('deactivated.owner@example.com', 'Dana Deactivated', token);
    expect(attempt.status).toBe(302);
    expect(attempt.headers.location).toMatch(/error=member_deactivated/);

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const mem = await check.query<{ role: string; seat_status: string }>(
        `SELECT role, seat_status FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
        [ACME, userId]
      );
      expect(mem.rows[0]?.seat_status).toBe('deactivated');
      expect(mem.rows[0]?.role).toBe('owner');
      await check.query(
        `DELETE FROM invites WHERE tenant_id = $1 AND email = $2`,
        [ACME, 'deactivated.owner@example.com']
      );
    } finally {
      await check.end();
    }
  });

  it('refuses a new invite to a deactivated member so it does not hold a seat', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const before = await admin.get('/api/v1/tenant/seats');
    const used = before.body.seats_used as number;
    await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
    try {
      const created = await admin.post('/api/v1/tenant/seats/invite').send({
        email: 'member@example.com',
        role: 'admin',
      });
      expect(created.status).toBe(409);
      expect(created.body.error.code).toBe('MEMBER_DEACTIVATED');
      const after = await admin.get('/api/v1/tenant/seats');
      expect(after.body.invites.some((i: { email: string }) => i.email === 'member@example.com')).toBe(false);
      expect(after.body.seats_used).toBeLessThan(used);
    } finally {
      await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
    }
  });

  it('rejects a deactivated member who tries to redeem an invite', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
    const token = randomToken(32);
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'member@example.com', 'admin', $2, NOW() + INTERVAL '1 day')`,
        [ACME, hashToken(token)]
      );
    } finally {
      await ownerDb.end();
    }
    const attempt = await loginWithInvite('member@example.com', 'Morgan Member', token);
    expect(attempt.status).toBe(302);
    expect(attempt.headers.location).toMatch(/error=member_deactivated/);

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const mem = await check.query<{ role: string; seat_status: string }>(
        `SELECT role, seat_status FROM memberships WHERE id = $1`,
        [MEMBERSHIP_MEMBER]
      );
      expect(mem.rows[0]?.seat_status).toBe('deactivated');
      expect(mem.rows[0]?.role).toBe('member');
      await check.query(
        `DELETE FROM invites WHERE tenant_id = $1 AND email = 'member@example.com' AND accepted_at IS NULL`,
        [ACME]
      );
      await check.query(`UPDATE memberships SET seat_status = 'active' WHERE id = $1`, [MEMBERSHIP_MEMBER]);
    } finally {
      await check.end();
    }
  });

  it('applies the invite role and does not keep a prior owner role', async () => {
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    const token = randomToken(32);
    try {
      await ownerDb.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        ['00000000-0000-0000-0000-000000000031', 'role.change@example.com', 'Pat Prior']
      );
      await ownerDb.query(
        `INSERT INTO memberships (tenant_id, user_id, role, seat_status)
         VALUES ($1, $2, 'owner', 'invited')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', seat_status = 'invited'`,
        [ACME, '00000000-0000-0000-0000-000000000031']
      );
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, $2, 'member', $3, NOW() + INTERVAL '1 day')`,
        [ACME, 'role.change@example.com', hashToken(token)]
      );
    } finally {
      await ownerDb.end();
    }

    const accepted = await loginWithInvite('role.change@example.com', 'Pat Prior', token);
    expect(accepted.status).toBe(302);
    expect(accepted.headers.location).toMatch(/\/meetings/);
    expect(String(accepted.headers['set-cookie'] ?? '')).toMatch(/ma_session=/);

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const mem = await check.query<{ role: string; seat_status: string }>(
        `SELECT role, seat_status FROM memberships
         WHERE tenant_id = $1 AND user_id = $2`,
        [ACME, '00000000-0000-0000-0000-000000000031']
      );
      expect(mem.rows[0]?.role).toBe('member');
      expect(mem.rows[0]?.seat_status).toBe('active');
    } finally {
      await check.end();
    }
  });

  it('picks an active membership for a multi-tenant user whose other seat is deactivated', async () => {
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query(
        `INSERT INTO memberships (id, tenant_id, user_id, role, seat_status)
         VALUES ($1, $2, $3, 'member', 'active')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET seat_status = 'active'`,
        [LUMEN_MEMBER_SEAT, LUMEN, '00000000-0000-0000-0000-000000000013']
      );
    } finally {
      await ownerDb.end();
    }

    const admin = await login('owner@example.com', 'Avery Owner');
    await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);

    const member = await login('member@example.com', 'Morgan Member');
    const me = await member.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.tenant.slug).toBe('lumen-vale');
    expect(me.body.seat_status).toBe('active');
    const meetings = await member.get('/api/v1/meetings');
    expect(meetings.status).toBe(200);

    await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
  });

  it('rejects an invite inserted past seat_limit, including after the limit is lowered', async () => {
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    const tenantId = '00000000-0000-0000-0000-000000000040';
    const holderId = '00000000-0000-0000-0000-000000000041';
    const extraId = '00000000-0000-0000-0000-000000000042';
    const loweredId = '00000000-0000-0000-0000-000000000043';
    const pastToken = randomToken(32);
    const loweredToken = randomToken(32);
    try {
      await ownerDb.query(
        `INSERT INTO tenants (id, name, slug, plan_code, seat_limit, billing_status)
         VALUES ($1, 'Cap Co', 'cap-co', 'pilot', 1, 'pilot')
         ON CONFLICT (id) DO UPDATE SET seat_limit = 1`,
        [tenantId]
      );
      await ownerDb.query(
        `INSERT INTO tenant_settings (tenant_id, retention_days) VALUES ($1, 365)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
      await ownerDb.query(
        `INSERT INTO users (id, email, name) VALUES
           ($1, 'holder@example.com', 'Holden Holder'),
           ($2, 'extra.seat@example.com', 'Extra Seat'),
           ($3, 'lowered.limit@example.com', 'Lowered Limit')
         ON CONFLICT (id) DO NOTHING`,
        [holderId, extraId, loweredId]
      );
      await ownerDb.query(
        `INSERT INTO memberships (tenant_id, user_id, role, seat_status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET seat_status = 'active'`,
        [tenantId, holderId]
      );
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'extra.seat@example.com', 'member', $2, NOW() + INTERVAL '1 day')`,
        [tenantId, hashToken(pastToken)]
      );

      const past = await getAppPool().query<{ auth_accept_invite: { ok: boolean; code?: string } }>(
        'SELECT auth_accept_invite($1,$2,$3) AS auth_accept_invite',
        [hashToken(pastToken), extraId, 'extra.seat@example.com']
      );
      expect(past.rows[0].auth_accept_invite.ok).toBe(false);
      expect(past.rows[0].auth_accept_invite.code).toBe('SEAT_LIMIT_REACHED');

      await ownerDb.query(`UPDATE tenants SET seat_limit = 2 WHERE id = $1`, [tenantId]);
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'lowered.limit@example.com', 'member', $2, NOW() + INTERVAL '1 day')`,
        [tenantId, hashToken(loweredToken)]
      );
      await ownerDb.query(`UPDATE tenants SET seat_limit = 1 WHERE id = $1`, [tenantId]);
      const lowered = await getAppPool().query<{ auth_accept_invite: { ok: boolean; code?: string } }>(
        'SELECT auth_accept_invite($1,$2,$3) AS auth_accept_invite',
        [hashToken(loweredToken), loweredId, 'lowered.limit@example.com']
      );
      expect(lowered.rows[0].auth_accept_invite.ok).toBe(false);
      expect(lowered.rows[0].auth_accept_invite.code).toBe('SEAT_LIMIT_REACHED');
    } finally {
      await ownerDb.end();
    }
  });

  it('serializes concurrent accepts at the seat cap so only one succeeds', async () => {
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    const tenantId = '00000000-0000-0000-0000-000000000050';
    const userA = '00000000-0000-0000-0000-000000000051';
    const userB = '00000000-0000-0000-0000-000000000052';
    const tokenA = randomToken(32);
    const tokenB = randomToken(32);
    try {
      await ownerDb.query(
        `INSERT INTO tenants (id, name, slug, plan_code, seat_limit, billing_status)
         VALUES ($1, 'Race Co', 'race-co', 'pilot', 1, 'pilot')
         ON CONFLICT (id) DO UPDATE SET seat_limit = 1`,
        [tenantId]
      );
      await ownerDb.query(
        `INSERT INTO tenant_settings (tenant_id, retention_days) VALUES ($1, 365)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      );
      await ownerDb.query(
        `INSERT INTO users (id, email, name) VALUES
           ($1, 'race.a@example.com', 'Race A'),
           ($2, 'race.b@example.com', 'Race B')
         ON CONFLICT (id) DO NOTHING`,
        [userA, userB]
      );
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at) VALUES
           ($1, 'race.a@example.com', 'member', $2, NOW() + INTERVAL '1 day'),
           ($1, 'race.b@example.com', 'member', $3, NOW() + INTERVAL '1 day')`,
        [tenantId, hashToken(tokenA), hashToken(tokenB)]
      );
    } finally {
      await ownerDb.end();
    }

    const [one, two] = await Promise.all([
      getAppPool().query<{ auth_accept_invite: { ok: boolean; code?: string } }>(
        'SELECT auth_accept_invite($1,$2,$3) AS auth_accept_invite',
        [hashToken(tokenA), userA, 'race.a@example.com']
      ),
      getAppPool().query<{ auth_accept_invite: { ok: boolean; code?: string } }>(
        'SELECT auth_accept_invite($1,$2,$3) AS auth_accept_invite',
        [hashToken(tokenB), userB, 'race.b@example.com']
      ),
    ]);

    const results = [one.rows[0].auth_accept_invite, two.rows[0].auth_accept_invite];
    expect(results.filter((row) => row.ok).length).toBe(1);
    expect(results.filter((row) => row.code === 'SEAT_LIMIT_REACHED').length).toBe(1);
  });

  it('refuses resend and accept of a stale member invite for the sole owner', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const acceptToken = randomToken(32);
    const resendToken = randomToken(32);
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    let acceptInviteId = '';
    let resendInviteId = '';
    try {
      const acceptInserted = await ownerDb.query<{ id: string }>(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'owner@example.com', 'member', $2, NOW() + INTERVAL '1 day')
         RETURNING id`,
        [ACME, hashToken(acceptToken)]
      );
      acceptInviteId = acceptInserted.rows[0].id;
      const resendInserted = await ownerDb.query<{ id: string }>(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'owner@example.com', 'member', $2, NOW() + INTERVAL '1 day')
         RETURNING id`,
        [ACME, hashToken(resendToken)]
      );
      resendInviteId = resendInserted.rows[0].id;
    } finally {
      await ownerDb.end();
    }

    const accepted = await loginWithInvite('owner@example.com', 'Avery Owner', acceptToken);
    expect(accepted.status).toBe(302);
    expect(accepted.headers.location).toMatch(/error=(already_member|last_owner)/);

    const resend = await admin.post(`/api/v1/tenant/seats/invites/${resendInviteId}/resend`);
    expect(resend.status).toBe(409);
    expect(resend.body.error.code).toBe('ALREADY_MEMBER');

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const owner = await check.query<{ role: string; seat_status: string }>(
        `SELECT role, seat_status FROM memberships WHERE user_id = $1 AND tenant_id = $2`,
        [ACME_OWNER, ACME]
      );
      expect(owner.rows[0]?.role).toBe('owner');
      expect(owner.rows[0]?.seat_status).toBe('active');
      const owners = await check.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM memberships
         WHERE tenant_id = $1 AND role = 'owner' AND seat_status = 'active'`,
        [ACME]
      );
      expect(Number(owners.rows[0]?.n)).toBe(1);
      const revoked = await check.query<{ id: string; revoked_at: Date | null }>(
        `SELECT id, revoked_at FROM invites WHERE id = ANY($1::uuid[])`,
        [[acceptInviteId, resendInviteId]]
      );
      expect(revoked.rowCount).toBe(2);
      expect(revoked.rows.every((row) => row.revoked_at !== null)).toBe(true);
    } finally {
      await check.end();
    }
  });

  it('fails fast against a silent SMTP server, rolls back the invite, and does not block deactivate', async () => {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', () => resolve()));
    const port = (silent.address() as AddressInfo).port;
    const admin = await login('owner@example.com', 'Avery Owner');
    const before = await admin.get('/api/v1/tenant/seats');
    const used = before.body.seats_used as number;
    setEmailAdapter(
      createSmtpEmailAdapter({
        host: '127.0.0.1',
        port,
        from: 'noreply@example.com',
        secure: false,
      })
    );
    const started = Date.now();
    try {
      const inviteReq = admin.post('/api/v1/tenant/seats/invite').send({
        email: 'silent.smtp@example.com',
        role: 'member',
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const deactivateReq = admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/deactivate`);
      const [created, deactivated] = await Promise.all([inviteReq, deactivateReq]);
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(created.status).toBe(500);
      expect(created.body.error.code).toBe('INTERNAL');
      expect(created.body.error.message).toBe('Internal server error');
      expect(JSON.stringify(created.body)).not.toMatch(/ETIMEDOUT|ECONNECTION|ESOCKET|Greeting|smtp/i);
      expect(deactivated.status).toBe(200);
      expect(
        deactivated.body.members.find((m: { id: string }) => m.id === MEMBERSHIP_MEMBER)?.seat_status
      ).toBe('deactivated');
      const after = await admin.get('/api/v1/tenant/seats');
      expect(after.body.invites.some((i: { email: string }) => i.email === 'silent.smtp@example.com')).toBe(
        false
      );
      expect(after.body.seats_used).toBe(used - 1);
      const leftover = new pg.Client({ connectionString: stack.ownerUrl });
      await leftover.connect();
      try {
        const rows = await leftover.query(
          `SELECT id FROM invites WHERE tenant_id = $1 AND email = 'silent.smtp@example.com'`,
          [ACME]
        );
        expect(rows.rowCount).toBe(0);
      } finally {
        await leftover.end();
      }
    } finally {
      setEmailAdapter(createCapturingEmailAdapter(inbox));
      await admin.post(`/api/v1/tenant/seats/${MEMBERSHIP_MEMBER}/reactivate`);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => silent.close((err) => (err ? reject(err) : resolve())));
    }
  }, 20_000);

  it('rolls back a new invite when email send fails so the seat is not held', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const before = await admin.get('/api/v1/tenant/seats');
    const used = before.body.seats_used as number;
    setEmailAdapter({
      transport: 'log',
      async send() {
        throw new Error('smtp down');
      },
    });
    try {
      const created = await admin.post('/api/v1/tenant/seats/invite').send({
        email: 'send.fail@example.com',
        role: 'member',
      });
      expect(created.status).toBe(500);
      expect(created.body.error.code).toBe('INTERNAL');
      expect(created.body.error.message).toBe('Internal server error');
      expect(JSON.stringify(created.body)).not.toContain('smtp down');
      const after = await admin.get('/api/v1/tenant/seats');
      expect(after.body.seats_used).toBe(used);
      expect(after.body.invites.some((i: { email: string }) => i.email === 'send.fail@example.com')).toBe(
        false
      );
    } finally {
      setEmailAdapter(createCapturingEmailAdapter(inbox));
    }
  });

  it('does not 500 when two first-logins with the same email race, and the invite stays single-use', async () => {
    const token = randomToken(32);
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'race.same@example.com', 'member', $2, NOW() + INTERVAL '1 day')`,
        [ACME, hashToken(token)]
      );
    } finally {
      await ownerDb.end();
    }

    const issuer = 'https://accounts.google.com';
    const [one, two] = await Promise.all([
      getAppPool().query<{
        auth_resolve_identity: { ok: boolean; code?: string; invite?: { ok?: boolean; code?: string } };
      }>('SELECT auth_resolve_identity($1,$2,$3,$4,$5,$6,$7) AS auth_resolve_identity', [
        issuer,
        'mock-sub-race.same@example.com',
        'google',
        'race.same@example.com',
        'Race Same',
        true,
        hashToken(token),
      ]),
      getAppPool().query<{
        auth_resolve_identity: { ok: boolean; code?: string; invite?: { ok?: boolean; code?: string } };
      }>('SELECT auth_resolve_identity($1,$2,$3,$4,$5,$6,$7) AS auth_resolve_identity', [
        issuer,
        'mock-sub-race.same@example.com',
        'google',
        'race.same@example.com',
        'Race Same',
        true,
        hashToken(token),
      ]),
    ]);

    const results = [one.rows[0].auth_resolve_identity, two.rows[0].auth_resolve_identity];
    expect(results).toHaveLength(2);
    expect(results.every((row) => typeof row.ok === 'boolean')).toBe(true);
    const accepted = results.filter((row) => row.invite?.ok === true);
    const refused = results.filter((row) => row.invite?.ok === false || row.ok === false);
    expect(accepted.length).toBe(1);
    expect(refused.length).toBe(1);

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const users = await check.query('SELECT id FROM users WHERE email = $1', ['race.same@example.com']);
      expect(users.rowCount).toBe(1);
      const invites = await check.query<{ accepted_at: Date | null }>(
        `SELECT accepted_at FROM invites WHERE token_hash = $1`,
        [hashToken(token)]
      );
      expect(invites.rows[0]?.accepted_at).not.toBeNull();
    } finally {
      await check.end();
    }
  });

  it('re-checks the seat cap on resend after the limit is lowered', async () => {
    const admin = await login('owner@example.com', 'Avery Owner');
    const created = await admin.post('/api/v1/tenant/seats/invite').send({
      email: 'resend.cap@example.com',
      role: 'member',
    });
    expect(created.status).toBe(201);
    const inviteId = created.body.invites.find((i: { email: string }) => i.email === 'resend.cap@example.com')
      ?.id as string;
    const ownerDb = new pg.Client({ connectionString: stack.ownerUrl });
    await ownerDb.connect();
    try {
      await ownerDb.query('UPDATE tenants SET seat_limit = 1 WHERE id = $1', [ACME]);
      const resend = await admin.post(`/api/v1/tenant/seats/invites/${inviteId}/resend`);
      expect(resend.status).toBe(409);
      expect(resend.body.error.code).toBe('SEAT_LIMIT_REACHED');
    } finally {
      await ownerDb.query('UPDATE tenants SET seat_limit = 10 WHERE id = $1', [ACME]);
      await ownerDb.end();
    }
  });
});
