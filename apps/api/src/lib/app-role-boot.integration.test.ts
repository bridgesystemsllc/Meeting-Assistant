import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  applyAuthEnv,
  rewriteConnectionUrl,
  startPostgresManagedOwner,
} from '../test/harness.js';
import {
  APP_ROLE_GUARD_SQL,
  assertConnectedAppRole,
  assertRestrictedAppRole,
  type AppRoleGuardRow,
} from './app-role.js';
import { getAppPool, getOwnerPool, resetPools } from './db.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const apiEntry = path.join(repoRoot, 'apps/api/src/index.ts');
const workerEntry = path.join(repoRoot, 'apps/worker/src/index.ts');

const INHERIT_PASSWORD = 'inherit-test-secret';
const NOINHERIT_PASSWORD = 'noinherit-test-secret';
const APP_MEMBER_PASSWORD = 'appmember-test-secret';

const ACME = '00000000-0000-0000-0000-000000000010';
const LUMEN = '00000000-0000-0000-0000-000000000001';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const LUMEN_OWNER = '00000000-0000-0000-0000-000000000002';
const ACME_MEETING = '10000000-0000-0000-0000-0000000000aa';
const LUMEN_MEETING = '10000000-0000-0000-0000-0000000000bb';

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

function bootEnv(appDatabaseUrl: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    APP_DATABASE_URL: appDatabaseUrl,
    DATABASE_URL: appDatabaseUrl,
    LOG_LEVEL: 'silent',
    REDIS_URL: 'redis://127.0.0.1:1',
  };
}

async function expectApiAndWorkerRefuse(url: string): Promise<void> {
  const env = bootEnv(url);
  const [api, worker] = await Promise.all([bootEntry(apiEntry, env), bootEntry(workerEntry, env)]);
  expect(api.code, `api: ${api.output}`).toBe(1);
  expect(api.output).toMatch(/meeting_assistant_app/);
  expect(worker.code, `worker: ${worker.output}`).toBe(1);
  expect(worker.output).toMatch(/meeting_assistant_app/);
}

async function queryAs(url: string, sql: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query<AppRoleGuardRow>(sql);
  } finally {
    await client.end();
  }
}

describe('app role boot allow-list', () => {
  let container: { stop: () => Promise<unknown> };
  let adminManagedUrl: string;
  let appUrl: string;
  let inheritUrl: string;
  let noinheritUrl: string;
  let appMemberUrl: string;

  beforeAll(async () => {
    const pgStack = await startPostgresManagedOwner();
    container = pgStack.container;
    adminManagedUrl = rewriteConnectionUrl(pgStack.adminUrl, { database: 'ma_managed' });
    appUrl = pgStack.appUrl;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: 'http://127.0.0.1:0/mock-oidc',
    });
    await resetPools();

    const admin = new pg.Client({ connectionString: pgStack.adminUrl });
    await admin.connect();
    try {
      await admin.query(`
        CREATE ROLE ma_owner_inherit LOGIN PASSWORD '${INHERIT_PASSWORD}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
        CREATE ROLE ma_owner_noinherit LOGIN PASSWORD '${NOINHERIT_PASSWORD}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
        CREATE ROLE ma_app_member LOGIN PASSWORD '${APP_MEMBER_PASSWORD}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
        GRANT meeting_assistant_owner TO ma_owner_inherit;
        GRANT meeting_assistant_owner TO ma_owner_noinherit;
        GRANT meeting_assistant_app TO ma_app_member;
        GRANT CONNECT ON DATABASE ma_managed TO ma_owner_inherit;
        GRANT CONNECT ON DATABASE ma_managed TO ma_owner_noinherit;
        GRANT CONNECT ON DATABASE ma_managed TO ma_app_member;
      `);
    } finally {
      await admin.end();
    }

    inheritUrl = rewriteConnectionUrl(pgStack.adminUrl, {
      username: 'ma_owner_inherit',
      password: INHERIT_PASSWORD,
      database: 'ma_managed',
    });
    noinheritUrl = rewriteConnectionUrl(pgStack.adminUrl, {
      username: 'ma_owner_noinherit',
      password: NOINHERIT_PASSWORD,
      database: 'ma_managed',
    });
    appMemberUrl = rewriteConnectionUrl(pgStack.adminUrl, {
      username: 'ma_app_member',
      password: APP_MEMBER_PASSWORD,
      database: 'ma_managed',
    });

    await getOwnerPool().query(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status, recall_bot_id)
       VALUES
         ($1, $2, $3, 'Acme standup', 'meet', 'https://meet.google.com/aaa-bbbb-ccc', 'completed', 'bot-acme-1'),
         ($4, $5, $6, 'Lumen QBR', 'zoom', 'https://zoom.us/j/5551112222', 'completed', 'bot-lumen-1')`,
      [ACME_MEETING, ACME, ACME_OWNER, LUMEN_MEETING, LUMEN, LUMEN_OWNER]
    );
  }, 120_000);

  afterAll(async () => {
    await resetPools();
    await container.stop();
  }, 60_000);

  it('lets meeting_assistant_app boot and sees 0 rows with no tenant set', async () => {
    const appGuard = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
    expect(appGuard.rows[0].is_app_role).toBe(true);
    expect(appGuard.rows[0].session_role).toBe('meeting_assistant_app');
    expect(appGuard.rows[0].current_role).toBe('meeting_assistant_app');
    expect(appGuard.rows[0].rolsuper).toBe(false);
    expect(appGuard.rows[0].rolbypassrls).toBe(false);
    expect(appGuard.rows[0].owns_public_relation).toBe(false);
    expect(appGuard.rows[0].owns_security_definer).toBe(false);
    expect(appGuard.rows[0].member_of_table_owner).toBe(false);
    expect(appGuard.rows[0].has_definer_access).toBe(false);
    expect(appGuard.rows[0].has_nontenant_policy).toBe(false);
    await assertConnectedAppRole();

    const visible = await getAppPool().query('SELECT id FROM meetings');
    expect(visible.rowCount).toBe(0);
  });

  it('refuses an INHERIT member of the table owner in API and worker', async () => {
    const inherit = new pg.Client({ connectionString: inheritUrl });
    await inherit.connect();
    try {
      const leak = await inherit.query('SELECT id FROM meetings ORDER BY id');
      expect(leak.rows.map((r) => r.id).sort()).toEqual([LUMEN_MEETING, ACME_MEETING].sort());
      const guard = await inherit.query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
      expect(guard.rows[0].is_app_role).toBe(false);
      expect(guard.rows[0].member_of_table_owner).toBe(true);
      expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/meeting_assistant_app/);
    } finally {
      await inherit.end();
    }
    await expectApiAndWorkerRefuse(inheritUrl);
  }, 40_000);

  it('refuses NOINHERIT + SET ROLE onto the table owner in API and worker', async () => {
    const client = new pg.Client({ connectionString: noinheritUrl });
    await client.connect();
    try {
      await client.query('SET ROLE meeting_assistant_owner');
      const who = await client.query<{ session_user: string; current_user: string }>(
        'SELECT session_user::text, current_user::text'
      );
      expect(who.rows[0].session_user).toBe('ma_owner_noinherit');
      expect(who.rows[0].current_user).toBe('meeting_assistant_owner');
      const leak = await client.query('SELECT id FROM meetings');
      expect(leak.rowCount).toBe(2);
      const guard = await client.query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
      expect(guard.rows[0].is_app_role).toBe(false);
      expect(guard.rows[0].session_role).toBe('ma_owner_noinherit');
      expect(guard.rows[0].current_role).toBe('meeting_assistant_owner');
      expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/meeting_assistant_app/);
    } finally {
      await client.end();
    }
    await expectApiAndWorkerRefuse(noinheritUrl);
  }, 40_000);

  it('refuses a member of meeting_assistant_app that is not that role', async () => {
    const guard = await queryAs(appMemberUrl, APP_ROLE_GUARD_SQL);
    expect(guard.rows[0].is_app_role).toBe(false);
    expect(guard.rows[0].session_role).toBe('ma_app_member');
    expect(guard.rows[0].current_role).toBe('ma_app_member');
    expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/members of that role are not allowed/);
    await expectApiAndWorkerRefuse(appMemberUrl);
  }, 40_000);

  it('refuses USING (1 = 1) on the app role in API and worker', async () => {
    await getOwnerPool().query(
      'CREATE POLICY sonar_eq ON meetings TO meeting_assistant_app USING (1 = 1)'
    );
    try {
      const guard = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
      expect(guard.rows[0].is_app_role).toBe(true);
      expect(guard.rows[0].has_nontenant_policy).toBe(true);
      expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/tenant-scoped policies/);
      await expect(assertConnectedAppRole()).rejects.toThrow(/tenant-scoped policies/);
      await expectApiAndWorkerRefuse(appUrl);
    } finally {
      await getOwnerPool().query('DROP POLICY IF EXISTS sonar_eq ON meetings');
    }
    await assertConnectedAppRole();
  }, 40_000);

  it('refuses USING (tenant_id IS NOT NULL) on the app role in API and worker', async () => {
    await getOwnerPool().query(
      'CREATE POLICY sonar_notnull ON meetings TO meeting_assistant_app USING (tenant_id IS NOT NULL)'
    );
    try {
      const guard = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
      expect(guard.rows[0].is_app_role).toBe(true);
      expect(guard.rows[0].has_nontenant_policy).toBe(true);
      expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/tenant-scoped policies/);
      await expect(assertConnectedAppRole()).rejects.toThrow(/tenant-scoped policies/);
      const leak = await getAppPool().query('SELECT id FROM meetings');
      expect(leak.rowCount).toBe(2);
      await expectApiAndWorkerRefuse(appUrl);
    } finally {
      await getOwnerPool().query('DROP POLICY IF EXISTS sonar_notnull ON meetings');
    }
    await assertConnectedAppRole();
    const hidden = await getAppPool().query('SELECT id FROM meetings');
    expect(hidden.rowCount).toBe(0);
  }, 40_000);

  it('refuses when meeting_assistant_app owns a SECURITY DEFINER function', async () => {
    const admin = new pg.Client({ connectionString: adminManagedUrl });
    await admin.connect();
    try {
      await admin.query('ALTER FUNCTION lookup_user_contact(uuid) OWNER TO meeting_assistant_app');
      const guard = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
      expect(guard.rows[0].owns_security_definer).toBe(true);
      expect(() => assertRestrictedAppRole(guard.rows[0])).toThrow(/SECURITY DEFINER/);
      await expect(assertConnectedAppRole()).rejects.toThrow(/SECURITY DEFINER/);
    } finally {
      await admin.query(
        'ALTER FUNCTION lookup_user_contact(uuid) OWNER TO meeting_assistant_owner'
      ).catch(() => undefined);
      await admin.end();
    }
    await assertConnectedAppRole();
  });
});
