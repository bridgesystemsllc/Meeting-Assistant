/**
 * Migration upgrade path for consent_events (node-pg-migrate).
 *
 * A database that already ran every main-era migration (through
 * 20261110255000_processing_dlq_force_rls, unchanged) must pick up
 * consent columns, consent_events FORCE RLS, and canonical
 * tenant_isolation from 20261110256000_consent when `migrate:up` runs.
 * Synthetic data only.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { startEmptyPostgres } from '../test/harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../../db/migrations');
const NEW_MIGRATION = '20261110256000_consent';
const MAIN_ERA_LAST = '20261110255000_processing_dlq_force_rls';
const MIGRATIONS_TABLE = 'pgmigrations';

const TENANT = '00000000-0000-0000-0000-000000000010'; // synthetic seed tenant (002)
const USER = '00000000-0000-0000-0000-000000000011'; // synthetic seed user (002)
const MEETING = '00000000-0000-0000-0000-0000000000c1';

function migrate(databaseUrl: string, dir: string) {
  return runner({
    databaseUrl,
    dir,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    log: () => {},
  });
}

async function relationExists(client: pg.Client, name: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = $1
     ) AS exists`,
    [name]
  );
  return result.rows[0]?.exists === true;
}

async function consentRlsState(client: pg.Client) {
  const rel = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE oid = 'public.consent_events'::regclass`
  );
  const policies = await client.query<{
    policyname: string;
    roles: string[];
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT policyname, roles::text[] AS roles, qual, with_check FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'consent_events'
      ORDER BY policyname`
  );
  return { rel: rel.rows[0], policies: policies.rows };
}

describe('migrations upgrade path (main-era DB -> consent migrate:up)', () => {
  let stack: Awaited<ReturnType<typeof startEmptyPostgres>>;
  let mainEraDir: string;
  let client: pg.Client;

  beforeAll(async () => {
    stack = await startEmptyPostgres();

    mainEraDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-main-era-consent-'));
    const mainEra = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f <= `${MAIN_ERA_LAST}.sql`)
      .sort();
    expect(mainEra).toContain(`${MAIN_ERA_LAST}.sql`);
    expect(mainEra).not.toContain(`${NEW_MIGRATION}.sql`);
    for (const file of mainEra) {
      fs.copyFileSync(path.join(migrationsDir, file), path.join(mainEraDir, file));
    }

    const applied = await migrate(stack.ownerUrl, mainEraDir);
    expect(applied.map((m) => m.name)).not.toContain(NEW_MIGRATION);
    expect(applied.length).toBe(mainEra.length);

    client = new pg.Client({ connectionString: stack.ownerUrl });
    await client.connect();
  }, 180_000);

  afterAll(async () => {
    await client?.end();
    await stack?.container.stop();
    if (mainEraDir) fs.rmSync(mainEraDir, { recursive: true, force: true });
  });

  it('starts from the main-era state: no consent_events table', async () => {
    expect(await relationExists(client, 'consent_events')).toBe(false);

    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'meetings'
          AND column_name = 'consent_status'`
    );
    expect(columns.rows).toEqual([]);

    await client.query(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
       VALUES ($1, $2, $3, 'Consent upgrade fixture', 'zoom', 'https://zoom.us/j/consent-upgrade', 'scheduled')`,
      [MEETING, TENANT, USER]
    );
  });

  it('migrate:up applies only the consent migration and lands FORCE RLS + tenant_isolation', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    const names = applied.map((m) => m.name);
    expect(names).toContain(NEW_MIGRATION);
    expect(names[0]).toBe(NEW_MIGRATION);
    for (const name of names) {
      expect(name >= NEW_MIGRATION, name).toBe(true);
    }

    expect(await relationExists(client, 'consent_events')).toBe(true);

    const { rel, policies } = await consentRlsState(client);
    expect(rel.relrowsecurity).toBe(true);
    expect(rel.relforcerowsecurity).toBe(true);
    expect(policies).toHaveLength(1);
    expect(policies.map((p) => p.policyname)).toEqual(['tenant_isolation']);
    const [policy] = policies;
    expect(policy.roles).toContain('meeting_assistant_app');
    expect(policy.qual).toMatch(
      /^\(tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'::text, true\), ''::text\)\)::uuid\)$/
    );
    expect(policy.with_check).toMatch(
      /^\(tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'::text, true\), ''::text\)\)::uuid\)$/
    );

    const grants = await client.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND table_name = 'consent_events'
          AND grantee = 'meeting_assistant_app'
        ORDER BY privilege_type`
    );
    expect(grants.rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
    expect(grants.rows.map((r) => r.privilege_type)).not.toContain('UPDATE');
    expect(grants.rows.map((r) => r.privilege_type)).not.toContain('DELETE');

    const meetingCols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'meetings'
          AND column_name IN ('consent_status', 'consent_denied_at', 'consent_denied_reason')
        ORDER BY column_name`
    );
    expect(meetingCols.rows.map((r) => r.column_name)).toEqual([
      'consent_denied_at',
      'consent_denied_reason',
      'consent_status',
    ]);

    const kept = await client.query('SELECT title FROM meetings WHERE id = $1', [MEETING]);
    expect(kept.rows).toEqual([{ title: 'Consent upgrade fixture' }]);
  });

  it('a second migrate:up is a no-op', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    expect(applied).toEqual([]);
  });

  it('re-running the new migration SQL directly succeeds and changes nothing', async () => {
    const sql = fs.readFileSync(path.join(migrationsDir, `${NEW_MIGRATION}.sql`), 'utf8');
    const before = await consentRlsState(client);
    await client.query(sql);
    await client.query(sql);
    const after = await consentRlsState(client);
    expect(after).toEqual(before);
  });
});
