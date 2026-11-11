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
        process.env.OIDC_REDIRECT_BASE = `http://127.0.0.1:${apiPort}`;
        process.env.PORT = String(apiPort);
        resolve({
          close: () =>
            new Promise<void>((r, j) => {
              server.close((err) => (err ? j(err) : r()));
            }),
        });
      });
    });
  }, 120_000);

  function api() {
    return request(`http://127.0.0.1:${apiPort}`);
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

  it('returns 400 INVALID_PKCE when the stored verifier does not match', async () => {
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const start = await api().get('/api/v1/auth/login/google').redirects(0);
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
    const res = await api()
      .get(callbackUrl.pathname + callbackUrl.search)
      .redirects(0);
    expect(res.status).toBe(400);
    expect(['INVALID_PKCE', 'OIDC_FAILED']).toContain(res.body.error.code);
  });

  it('completes OIDC login for an active member and serves /me', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);

    const start = await agent.get('/api/v1/auth/login/google').redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await agent.get(callback.pathname + callback.search).redirects(0);
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
  });

  it('denies a user with no membership', async () => {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email: 'outsider@example.com', name: 'Quinn Outsider' });
    const start = await api().get('/api/v1/auth/login/microsoft').redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await api().get(callback.pathname + callback.search).redirects(0);
    expect(done.status).toBe(302);
    expect(done.headers.location).toMatch(/error=no_access/);
    expect(done.headers['set-cookie'] ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining('ma_session=')])
    );
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
  });
}, 120_000);
