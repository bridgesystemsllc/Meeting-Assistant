/**
 * Migration upgrade path (node-pg-migrate).
 *
 * A database that already ran every main-era migration (through
 * 20261110230000_rename_transcript_retention, unchanged) must pick up
 * processing_dlq FORCE RLS + canonical tenant_isolation from the later
 * 20261110255000_processing_dlq_force_rls migration when `migrate:up` runs.
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
const NEW_MIGRATION = '20261110255000_processing_dlq_force_rls';
const MIGRATIONS_TABLE = 'pgmigrations';

const TENANT = '00000000-0000-0000-0000-000000000010'; // synthetic seed tenant (002)
const USER = '00000000-0000-0000-0000-000000000011'; // synthetic seed user (002)
const MEETING = '00000000-0000-0000-0000-0000000000d1';

function migrate(databaseUrl: string, dir: string) {
  return runner({
    databaseUrl,
    dir,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    log: () => {},
  });
}

async function dlqRlsState(client: pg.Client) {
  const rel = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE oid = 'public.processing_dlq'::regclass`
  );
  const policies = await client.query<{
    policyname: string;
    roles: string[];
    qual: string | null;
    with_check: string | null;
  }>(
    `SELECT policyname, roles::text[] AS roles, qual, with_check FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'processing_dlq'
      ORDER BY policyname`
  );
  return { rel: rel.rows[0], policies: policies.rows };
}

describe('migrations upgrade path (main-era DB -> migrate:up)', () => {
  let stack: Awaited<ReturnType<typeof startEmptyPostgres>>;
  let mainEraDir: string;
  let client: pg.Client;

  beforeAll(async () => {
    stack = await startEmptyPostgres();

    // Every migration that existed before the new one, i.e. the main-era set.
    mainEraDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-main-era-'));
    const mainEra = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f < `${NEW_MIGRATION}.sql`)
      .sort();
    expect(mainEra).toContain('20261110230000_rename_transcript_retention.sql');
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

  it('starts from the main-era state: legacy policy, no FORCE RLS', async () => {
    const { rel, policies } = await dlqRlsState(client);
    expect(rel.relrowsecurity).toBe(true);
    expect(rel.relforcerowsecurity).toBe(false);
    expect(policies.map((p) => p.policyname)).toEqual(['processing_dlq_tenant_policy']);

    // Synthetic row that must survive the upgrade.
    await client.query(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
       VALUES ($1, $2, $3, 'Upgrade fixture', 'zoom', 'https://zoom.us/j/upgrade', 'failed')`,
      [MEETING, TENANT, USER]
    );
    await client.query(
      `INSERT INTO processing_dlq (tenant_id, meeting_id, job_id, error, attempts)
       VALUES ($1, $2, 'job-upgrade', 'synthetic', 3)`,
      [TENANT, MEETING]
    );
  });

  it('migrate:up applies only the later migration and lands FORCE RLS + tenant_isolation', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    const names = applied.map((m) => m.name);
    expect(names).toContain(NEW_MIGRATION);
    for (const name of names) {
      expect(name >= NEW_MIGRATION, name).toBe(true);
    }

    const { rel, policies } = await dlqRlsState(client);
    expect(rel.relrowsecurity).toBe(true);
    expect(rel.relforcerowsecurity).toBe(true);
    expect(policies.map((p) => p.policyname)).toEqual(['tenant_isolation']);
    const [policy] = policies;
    expect(policy.roles).toContain('meeting_assistant_app');
    expect(policy.qual).toMatch(/^\(tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'::text, true\), ''::text\)\)::uuid\)$/);
    expect(policy.with_check).toMatch(/^\(tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'::text, true\), ''::text\)\)::uuid\)$/);

    const kept = await client.query('SELECT job_id FROM processing_dlq WHERE meeting_id = $1', [MEETING]);
    expect(kept.rows).toEqual([{ job_id: 'job-upgrade' }]);

    const grants = await client.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'processing_dlq' AND grantee = 'meeting_assistant_app'
        ORDER BY privilege_type`
    );
    expect(grants.rows.map((r) => r.privilege_type)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });

  it('a second migrate:up is a no-op', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    expect(applied).toEqual([]);
  });

  it('re-running the new migration SQL directly succeeds and changes nothing', async () => {
    const sql = fs.readFileSync(path.join(migrationsDir, `${NEW_MIGRATION}.sql`), 'utf8');
    const before = await dlqRlsState(client);
    await client.query(sql);
    await client.query(sql);
    const after = await dlqRlsState(client);
    expect(after).toEqual(before);
  });
});
