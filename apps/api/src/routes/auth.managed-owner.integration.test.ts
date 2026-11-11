import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import {
  applyAuthEnv,
  configureMockUser,
  startMockOidc,
  startPostgresManagedOwner,
} from '../test/harness.js';
import { resetPools } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';

describe('managed owner (NOSUPERUSER NOBYPASSRLS) migrations + login', () => {
  let container: Awaited<ReturnType<typeof startPostgresManagedOwner>>['container'];
  let ownerUrl: string;
  let mockOidc: Awaited<ReturnType<typeof startMockOidc>>['server'];
  let app: Express;
  let apiPort: number;
  let apiServer: { close: () => Promise<void> } | undefined;

  beforeAll(async () => {
    const pgStack = await startPostgresManagedOwner();
    container = pgStack.container;
    ownerUrl = pgStack.ownerUrl;
    const mock = await startMockOidc();
    mockOidc = mock.server;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: mock.issuerUrl,
    });
    await resetPools();
    clearOidcCache();

    const owner = new pg.Client({ connectionString: ownerUrl });
    await owner.connect();
    try {
      const attrs = await owner.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
      );
      expect(attrs.rows[0]?.rolsuper).toBe(false);
      expect(attrs.rows[0]?.rolbypassrls).toBe(false);

      const policies = await owner.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM pg_policy WHERE polname = 'auth_definer'`
      );
      expect(Number(policies.rows[0]?.n)).toBeGreaterThanOrEqual(6);
    } finally {
      await owner.end();
    }

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
  }, 120_000);

  afterAll(async () => {
    await apiServer?.close();
    await mockOidc.stop();
    await resetPools();
    await container.stop();
  }, 60_000);

  it('completes OIDC login when SECURITY DEFINER runs as the managed owner', async () => {
    clearOidcCache();
    configureMockUser(mockOidc, { email: 'owner@example.com', name: 'Avery Owner' });
    const agent = request.agent(`http://127.0.0.1:${apiPort}`);
    const start = await agent.get('/api/v1/auth/login/google').redirects(0);
    expect(start.status).toBe(302);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await agent.get(callback.pathname + callback.search).redirects(0);
    expect(done.status).toBe(302);
    expect(String(done.headers['set-cookie'] ?? '')).toMatch(/ma_session=/);

    const me = await agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('owner@example.com');
    expect(me.body.role).toBe('owner');
  });
});
