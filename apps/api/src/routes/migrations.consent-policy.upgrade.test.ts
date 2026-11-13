/**
 * Migration upgrade path for store_audio, consent_policy, and notify_attendees.
 *
 * A database that already ran through 20261110256000_consent must pick up
 * the later 20261112200000_store_audio_consent_policy migration when
 * `migrate:up` runs. Synthetic data only.
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
const NEW_MIGRATION = '20261112200000_store_audio_consent_policy';
const PREV_LAST = '20261110256000_consent';
const MIGRATIONS_TABLE = 'pgmigrations';

const TENANT = '00000000-0000-0000-0000-000000000010'; // synthetic seed tenant (002)

function migrate(databaseUrl: string, dir: string) {
  return runner({
    databaseUrl,
    dir,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    log: () => {},
  });
}

describe('migrations upgrade path (consent-era DB -> store_audio/consent_policy migrate:up)', () => {
  let stack: Awaited<ReturnType<typeof startEmptyPostgres>>;
  let prevDir: string;
  let client: pg.Client;

  beforeAll(async () => {
    stack = await startEmptyPostgres();

    prevDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-consent-era-'));
    const prev = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f <= `${PREV_LAST}.sql`)
      .sort();
    expect(prev).toContain(`${PREV_LAST}.sql`);
    expect(prev).not.toContain(`${NEW_MIGRATION}.sql`);
    for (const file of prev) {
      fs.copyFileSync(path.join(migrationsDir, file), path.join(prevDir, file));
    }

    const applied = await migrate(stack.ownerUrl, prevDir);
    expect(applied.map((m) => m.name)).not.toContain(NEW_MIGRATION);
    expect(applied.length).toBe(prev.length);

    client = new pg.Client({ connectionString: stack.ownerUrl });
    await client.connect();
  }, 180_000);

  afterAll(async () => {
    await client?.end();
    await stack?.container.stop();
    if (prevDir) fs.rmSync(prevDir, { recursive: true, force: true });
  });

  it('starts from the consent-era state: no store_audio or consent_policy columns', async () => {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenant_settings'
          AND column_name IN ('store_audio', 'consent_policy', 'notify_attendees')
        ORDER BY column_name`
    );
    expect(columns.rows).toEqual([]);

    const settings = await client.query('SELECT tenant_id FROM tenant_settings WHERE tenant_id = $1', [
      TENANT,
    ]);
    expect(settings.rows).toEqual([{ tenant_id: TENANT }]);
  });

  it('migrate:up adds fixed store_audio, consent_policy, notify_attendees, and lookup_tenant_name', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    const names = applied.map((m) => m.name);
    expect(names).toContain(NEW_MIGRATION);
    expect(names[0]).toBe(NEW_MIGRATION);
    for (const name of names) {
      expect(name >= NEW_MIGRATION, name).toBe(true);
    }

    const columns = await client.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenant_settings'
          AND column_name IN ('store_audio', 'consent_policy', 'notify_attendees')
        ORDER BY column_name`
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual([
      'consent_policy',
      'notify_attendees',
      'store_audio',
    ]);

    const row = await client.query<{
      store_audio: boolean;
      consent_policy: string;
      notify_attendees: boolean;
    }>(
      `SELECT store_audio, consent_policy, notify_attendees
       FROM tenant_settings WHERE tenant_id = $1`,
      [TENANT]
    );
    expect(row.rows).toEqual([
      { store_audio: false, consent_policy: 'all_party_notice', notify_attendees: true },
    ]);

    await expect(
      client.query('UPDATE tenant_settings SET store_audio = true WHERE tenant_id = $1', [TENANT])
    ).rejects.toThrow();

    await client.query("SET app.tenant_id = '00000000-0000-0000-0000-000000000010'");
    const name = await client.query<{ lookup_tenant_name: string | null }>(
      'SELECT lookup_tenant_name($1) AS lookup_tenant_name',
      [TENANT]
    );
    expect(name.rows[0].lookup_tenant_name).toBe('Acme Notes');

    await client.query("SET app.tenant_id = '00000000-0000-0000-0000-000000000001'");
    const cross = await client.query<{ lookup_tenant_name: string | null }>(
      'SELECT lookup_tenant_name($1) AS lookup_tenant_name',
      [TENANT]
    );
    expect(cross.rows[0].lookup_tenant_name).toBeNull();

    await client.query('RESET app.tenant_id');
    const missing = await client.query<{ lookup_tenant_name: string | null }>(
      'SELECT lookup_tenant_name($1) AS lookup_tenant_name',
      [TENANT]
    );
    expect(missing.rows[0].lookup_tenant_name).toBeNull();
  });

  it('a second migrate:up is a no-op', async () => {
    const applied = await migrate(stack.ownerUrl, migrationsDir);
    expect(applied).toEqual([]);
  });

  it('re-running the new migration SQL directly succeeds and changes nothing', async () => {
    const sql = fs.readFileSync(path.join(migrationsDir, `${NEW_MIGRATION}.sql`), 'utf8');
    const before = await client.query(
      `SELECT store_audio, consent_policy, notify_attendees FROM tenant_settings WHERE tenant_id = $1`,
      [TENANT]
    );
    await client.query(sql);
    await client.query(sql);
    const after = await client.query(
      `SELECT store_audio, consent_policy, notify_attendees FROM tenant_settings WHERE tenant_id = $1`,
      [TENANT]
    );
    expect(after.rows).toEqual(before.rows);
  });
});
