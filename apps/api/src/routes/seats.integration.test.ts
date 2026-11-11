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
import { resetPools } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';
import { createCapturingEmailAdapter, setEmailAdapter } from '../lib/email.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const MEMBERSHIP_MEMBER = '00000000-0000-0000-0000-000000000024';

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
});
