import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import { applyAuthEnv, startPostgresManagedOwner } from '../test/harness.js';
import {
  APP_ROLE_GUARD_SQL,
  assertConnectedAppRole,
  assertRestrictedAppRole,
} from '../lib/app-role.js';
import { getAppPool, getOwnerPool, resetPools, withTenant } from '../lib/db.js';
import { issueSession } from '../lib/session.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';
import { lookupUserContact } from '../lib/tenant-lookup.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function bootEntry(
  entry: string,
  extra: NodeJS.ProcessEnv
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', entry], {
      cwd: repoRoot,
      env: { ...process.env, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`process did not exit. output=${output}`));
    }, 20_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

const ACME = '00000000-0000-0000-0000-000000000010';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const ACME_MEETING = '10000000-0000-0000-0000-0000000000aa';

describe('non-superuser non-BYPASSRLS owner', () => {
  let container: { stop: () => Promise<unknown> };
  let app: Express;
  let ownerUrl: string;
  let appUrl: string;

  beforeAll(async () => {
    const pgStack = await startPostgresManagedOwner();
    container = pgStack.container;
    ownerUrl = pgStack.ownerUrl;
    appUrl = pgStack.appUrl;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: 'http://127.0.0.1:0/mock-oidc',
    });
    await resetPools();

    const owner = await ownerQuery<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    );
    expect(owner.rows[0].rolsuper).toBe(false);
    expect(owner.rows[0].rolbypassrls).toBe(false);

    await ownerQuery(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status, recall_bot_id)
       VALUES ($1, $2, $3, 'Acme standup', 'meet', 'https://meet.google.com/aaa-bbbb-ccc', 'completed', 'bot-acme-notes-1')`,
      [ACME_MEETING, ACME, ACME_OWNER]
    );

    const { createApp } = await import('../app.js');
    app = createApp();
  }, 120_000);

  afterAll(async () => {
    await resetPools();
    await container.stop();
  }, 60_000);

  async function ownerQuery<T extends pg.QueryResultRow>(text: string, params?: unknown[]) {
    return getOwnerPool().query<T>(text, params);
  }

  it('refuses a NOSUPERUSER NOBYPASSRLS table owner as APP_DATABASE_URL and still boots the app role', async () => {
    const ownerGuard = await getOwnerPool().query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      owns_public_relation: boolean;
      has_unrestricted_rls_policy: boolean;
    }>(APP_ROLE_GUARD_SQL);
    expect(ownerGuard.rows[0].rolsuper).toBe(false);
    expect(ownerGuard.rows[0].rolbypassrls).toBe(false);
    expect(ownerGuard.rows[0].owns_public_relation).toBe(true);
    expect(ownerGuard.rows[0].has_unrestricted_rls_policy).toBe(true);
    expect(() => assertRestrictedAppRole(ownerGuard.rows[0])).toThrow(/meeting_assistant_app/);

    const appGuard = await getAppPool().query<{
      owns_public_relation: boolean;
      has_unrestricted_rls_policy: boolean;
    }>(APP_ROLE_GUARD_SQL);
    expect(appGuard.rows[0].owns_public_relation).toBe(false);
    expect(appGuard.rows[0].has_unrestricted_rls_policy).toBe(false);
    await assertConnectedAppRole();

    const bootEnv = {
      NODE_ENV: 'development',
      APP_DATABASE_URL: ownerUrl,
      DATABASE_URL: ownerUrl,
      LOG_LEVEL: 'silent',
      REDIS_URL: 'redis://127.0.0.1:1',
    };
    const api = await bootEntry(path.join(repoRoot, 'apps/api/src/index.ts'), bootEnv);
    expect(api.code).toBe(1);
    expect(api.output).toMatch(/meeting_assistant_app|owns relations|USING \(true\)/);

    const worker = await bootEntry(path.join(repoRoot, 'apps/worker/src/index.ts'), bootEnv);
    expect(worker.code).toBe(1);
    expect(worker.output).toMatch(/meeting_assistant_app|owns relations|USING \(true\)/);

    expect(process.env.APP_DATABASE_URL).toBe(appUrl);
  }, 40_000);

  it('keeps FORCE RLS on tenant tables and lets SECURITY DEFINER lookups work', async () => {
    const meetings = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'meetings'`
    );
    expect(meetings.rows[0].force_rls).toBe(true);

    const users = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'users'`
    );
    expect(users.rows[0].force_rls).toBe(true);

    const identities = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'user_identities'`
    );
    expect(identities.rows[0].force_rls).toBe(true);

    const contact = await lookupUserContact(ACME_OWNER, ACME);
    expect(contact?.email).toBe('owner@example.com');
  });

  it('serves tenant-scoped meetings over the request path', async () => {
    const { token } = await issueSession({ userId: ACME_OWNER, activeTenantId: ACME });
    const res = await request(app)
      .get('/api/v1/meetings')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meetings.map((m: { id: string }) => m.id)).toEqual([ACME_MEETING]);

    await withTenant(ACME, async (client) => {
      const rows = await client.query('SELECT id FROM meetings');
      expect(rows.rows.map((r) => r.id)).toEqual([ACME_MEETING]);
    });
  });
});
