import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import {
  applyAuthEnv,
  configureMockUser,
  startMockOidc,
  startPostgres,
  type TestStack,
} from '../test/harness.js';
import { resetPools, withTenant, getAppPool } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';

const ACME_TENANT = '00000000-0000-0000-0000-000000000010';
const ACME_MEMBER = '00000000-0000-0000-0000-000000000013';
const T2 = '00000000-0000-0000-0000-000000000030';
const B1 = '00000000-0000-0000-0000-000000000031';
const T2_MEETING = '00000000-0000-0000-0000-000000000032';

describe('auth integration', () => {
  let stack: Omit<TestStack, 'mockOidc' | 'issuerUrl'> & {
    mockOidc: Awaited<ReturnType<typeof startMockOidc>>['server'];
    issuerUrl: string;
  };
  let app: Express;
  let apiPort: number;
  let apiServer: { close: () => Promise<void> } | undefined;

  beforeAll(async () => {
    const pgStack = await startPostgres();
    const mock = await startMockOidc();
    stack = { ...pgStack, mockOidc: mock.server, issuerUrl: mock.issuerUrl };
    applyAuthEnv({ ownerUrl: pgStack.ownerUrl, appUrl: pgStack.appUrl, issuerUrl: mock.issuerUrl });
    await resetPools();
    clearOidcCache();

    const { createApp } = await import('../app.js');
    app = createApp();
    apiServer = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        apiPort = typeof addr === 'object' && addr ? addr.port : 0;
        process.env.PUBLIC_BASE_URL = `http://127.0.0.1:${apiPort}`;
        process.env.PORT = String(apiPort);
        resolve({
          close: () =>
            new Promise<void>((r, j) => {
              server.close((err) => (err ? j(err) : r()));
            }),
        });
      });
    });

    const owner = new pg.Client({ connectionString: stack.ownerUrl });
    await owner.connect();
    try {
      await owner.query(`
        INSERT INTO tenants (id, name, slug, plan_code, seat_limit, billing_status)
        VALUES ($1, 'Tenant Two', 'tenant-two', 'pilot', 10, 'pilot')
        ON CONFLICT (id) DO NOTHING
      `, [T2]);
      await owner.query(`
        INSERT INTO users (id, email, name)
        VALUES ($1, 'b1@tenant-two.example', 'Blake One')
        ON CONFLICT (id) DO NOTHING
      `, [B1]);
      await owner.query(`
        INSERT INTO memberships (tenant_id, user_id, role, seat_status)
        VALUES ($1, $2, 'owner', 'active')
        ON CONFLICT (tenant_id, user_id) DO NOTHING
      `, [T2, B1]);
      await owner.query(`
        INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
        VALUES ($1, $2, $3, 'T2 secret meeting', 'zoom', 'https://example.com/meet', 'completed')
        ON CONFLICT (id) DO NOTHING
      `, [T2_MEETING, T2, B1]);
      await owner.query(`
        INSERT INTO transcripts (tenant_id, meeting_id, full_text, word_count)
        VALUES ($1, $2, 'SECRET-m_t2 transcript', 3)
        ON CONFLICT (meeting_id) DO NOTHING
      `, [T2, T2_MEETING]);
      await owner.query(`
        INSERT INTO meeting_analysis (tenant_id, meeting_id, summary)
        VALUES ($1, $2, 'SECRET-m_t2 summary')
        ON CONFLICT (meeting_id) DO NOTHING
      `, [T2, T2_MEETING]);
    } finally {
      await owner.end();
    }
  }, 120_000);

  function api() {
    return request(`http://127.0.0.1:${apiPort}`);
  }

  async function finishOidc(agent: ReturnType<typeof request.agent>, provider: 'google' | 'microsoft') {
    const start = await agent.get(`/api/v1/auth/login/${provider}`).redirects(0);
    expect(start.status).toBe(302);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    return agent.get(callback.pathname + callback.search).redirects(0);
  }

  afterAll(async () => {
    await apiServer?.close();
    await stack.mockOidc.stop();
    await resetPools();
    await stack.container.stop();
  }, 60_000);

  it('returns 401 UNAUTHENTICATED for unauthenticated /api/v1/meetings', async () => {
    const res = await api().get('/api/v1/meetings');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 400 INVALID_STATE on state mismatch', async () => {
    const res = await api().get('/api/v1/auth/callback/google').query({ state: 'not-a-real-state', code: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('returns 400 INVALID_STATE when the callback has no state cookie (login CSRF)', async () => {
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const start = await api().get('/api/v1/auth/login/google').redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const res = await api().get(callback.pathname + callback.search).redirects(0);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATE');
    expect(String(res.headers['set-cookie'] ?? '')).not.toMatch(/ma_session=/);
  });

  it('returns 400 INVALID_PKCE when the stored verifier does not match', async () => {
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const start = await agent.get('/api/v1/auth/login/google').redirects(0);
    expect(start.status).toBe(302);
    const location = start.headers.location as string;
    const authUrl = new URL(location);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const owner = new pg.Client({ connectionString: stack.ownerUrl });
    await owner.connect();
    try {
      await owner.query('UPDATE oidc_login_state SET code_verifier = $1 WHERE state = $2', [
        'tampered-verifier',
        state,
      ]);
    } finally {
      await owner.end();
    }

    const idp = await fetch(location, { redirect: 'manual' });
    const callback = idp.headers.get('location');
    expect(callback).toBeTruthy();
    const callbackUrl = new URL(callback!);
    const res = await agent.get(callbackUrl.pathname + callbackUrl.search).redirects(0);
    expect(res.status).toBe(400);
    expect(['INVALID_PKCE', 'OIDC_FAILED']).toContain(res.body.error.code);
  });

  it('completes OIDC login for an active member and serves /me', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'google');
    expect(done.status).toBe(302);
    const setCookie = String(done.headers['set-cookie'] ?? '');
    expect(setCookie).toMatch(/ma_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('owner@example.com');
    expect(me.body.tenant.name).toBe('Acme Notes');
    expect(me.body.role).toBe('owner');
    expect(me.body.memberships.length).toBeGreaterThan(0);

    const meetings = await agent.get('/api/v1/meetings');
    expect(meetings.status).toBe(200);

    const badId = await agent.get('/api/v1/meetings/not-a-uuid');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('INVALID_ID');

    const capped = await agent.get('/api/v1/meetings').query({ limit: 9999, offset: 0 });
    expect(capped.status).toBe(200);
  });

  it('rejects Host-header redirect_uri and uses PUBLIC_BASE_URL', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const start = await agent
      .get('/api/v1/auth/login/google')
      .set('Host', 'evil.example')
      .redirects(0);
    expect(start.headers.location).toContain(encodeURIComponent(`http://127.0.0.1:${apiPort}/api/v1/auth/callback/google`));
    expect(start.headers.location).not.toContain('evil.example');
  });

  it('denies a user with no membership', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, {
      email: 'outsider@example.com',
      name: 'Quinn Outsider',
      xmsEdov: true,
    });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'microsoft');
    expect(done.status).toBe(302);
    expect(done.headers.location).toMatch(/error=no_access/);
    expect(String(done.headers['set-cookie'] ?? '')).not.toMatch(/ma_session=/);
  });

  it('lets an active member use meetings', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email: 'member@example.com', name: 'Morgan Member' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'google');
    expect(done.status).toBe(302);
    expect(String(done.headers['set-cookie'] ?? '')).toMatch(/ma_session=/);

    const me = await agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('member@example.com');
    expect(me.body.seat_status).toBe('active');

    const meetings = await agent.get('/api/v1/meetings');
    expect(meetings.status).toBe(200);
  });

  it('issues a session for a deactivated member and returns 403 SEAT_INACTIVE on guarded routes', async () => {
    const owner = new pg.Client({ connectionString: stack.ownerUrl });
    await owner.connect();
    try {
      await owner.query(`UPDATE memberships SET seat_status = 'deactivated' WHERE user_id = $1`, [
        ACME_MEMBER,
      ]);
    } finally {
      await owner.end();
    }

    try {
      clearOidcCache();
      configureMockUser(stack.mockOidc, { email: 'member@example.com', name: 'Morgan Member' });
      const agent = request.agent(`http://127.0.0.1:${apiPort}`);
      const done = await finishOidc(agent, 'google');
      expect(done.status).toBe(302);
      expect(done.headers.location).not.toMatch(/error=/);
      expect(String(done.headers['set-cookie'] ?? '')).toMatch(/ma_session=/);

      const me = await agent.get('/api/v1/me');
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('member@example.com');
      expect(me.body.seat_status).toBe('deactivated');

      const meetings = await agent.get('/api/v1/meetings');
      expect(meetings.status).toBe(403);
      expect(meetings.body.error).toEqual({
        code: 'SEAT_INACTIVE',
        message: 'Your seat is inactive. Ask your admin.',
      });

      const tenant = await agent.get('/api/v1/tenant/seats');
      expect(tenant.status).toBe(403);
      expect(tenant.body.error.code).toBe('SEAT_INACTIVE');
    } finally {
      const restore = new pg.Client({ connectionString: stack.ownerUrl });
      await restore.connect();
      try {
        await restore.query(`UPDATE memberships SET seat_status = 'active' WHERE user_id = $1`, [
          ACME_MEMBER,
        ]);
      } finally {
        await restore.end();
      }
    }
  });

  it('fails closed on unverified-email account takeover (SONAR P1)', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, {
      email: 'b1@tenant-two.example',
      name: 'Attacker',
      sub: 'attacker-sub-999',
      emailVerified: false,
    });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'google');
    expect(done.status).toBe(400);
    expect(done.body.error.code).toBe('EMAIL_UNVERIFIED');
    expect(String(done.headers['set-cookie'] ?? '')).not.toMatch(/ma_session=/);

    const stolen = await agent.get(`/api/v1/meetings/${T2_MEETING}`);
    expect(stolen.status).toBe(401);
    expect(JSON.stringify(stolen.body)).not.toContain('SECRET-m_t2');
  });

  it('does not auto-link a Microsoft identity onto an existing Google user by email', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, {
      email: 'owner@example.com',
      name: 'Avery Owner',
      sub: 'ms-other-sub',
      xmsEdov: true,
    });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'microsoft');
    expect(done.status).toBe(400);
    expect(done.body.error.code).toBe('OIDC_FAILED');
    expect(String(done.headers['set-cookie'] ?? '')).not.toMatch(/ma_session=/);
  });

  it('rejects Microsoft email linking without xms_edov (nOAuth)', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, {
      email: 'admin@example.com',
      name: 'Riley Admin',
      sub: 'ms-admin-unverified',
      emailVerified: true,
      xmsEdov: false,
    });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const done = await finishOidc(agent, 'microsoft');
    expect(done.status).toBe(400);
    expect(done.body.error.code).toBe('EMAIL_UNVERIFIED');
  });

  it('does not redeem an invite when the OIDC email is unverified', async () => {
    const token = 'invite-plaintext-example';
    const { hashToken } = await import('../lib/crypto.js');
    const owner = new pg.Client({ connectionString: stack.ownerUrl });
    await owner.connect();
    try {
      await owner.query(
        `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
         VALUES ($1, 'invited@example.com', 'member', $2, NOW() + INTERVAL '1 day')`,
        [ACME_TENANT, hashToken(token)]
      );
    } finally {
      await owner.end();
    }

    clearOidcCache();
    configureMockUser(stack.mockOidc, {
      email: 'invited@example.com',
      name: 'Casey Invited',
      sub: 'invite-attacker',
      emailVerified: false,
    });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const start = await agent.get('/api/v1/auth/login/google').query({ invite: token }).redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await agent.get(callback.pathname + callback.search).redirects(0);
    expect(done.status).toBe(400);
    expect(done.body.error.code).toBe('EMAIL_UNVERIFIED');

    const check = new pg.Client({ connectionString: stack.ownerUrl });
    await check.connect();
    try {
      const row = await check.query('SELECT accepted_at FROM invites WHERE token_hash = $1', [
        hashToken(token),
      ]);
      expect(row.rows[0].accepted_at).toBeNull();
    } finally {
      await check.end();
    }
  });

  it('rejects GET logout', async () => {
    const res = await api().get('/api/v1/auth/logout');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('clears app.tenant_id on the pooled connection after commit', async () => {
    await withTenant(ACME_TENANT, async (client) => {
      const inside = await client.query("SELECT current_setting('app.tenant_id', true) AS t");
      expect(inside.rows[0].t).toBe(ACME_TENANT);
    });

    const client = await getAppPool().connect();
    try {
      const after = await client.query("SELECT current_setting('app.tenant_id', true) AS t");
      expect(after.rows[0].t === null || after.rows[0].t === '').toBe(true);
    } finally {
      client.release();
    }
  });

  it('denies the app role direct access to global tables', async () => {
    await expect(getAppPool().query('SELECT * FROM users')).rejects.toThrow();
    await expect(getAppPool().query('SELECT * FROM sessions')).rejects.toThrow();
    await expect(getAppPool().query('SELECT * FROM tenants')).rejects.toThrow();
    await expect(getAppPool().query('SELECT * FROM user_identities')).rejects.toThrow();
  });
}, 120_000);
