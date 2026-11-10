import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { applyAuthEnv, startPostgres } from '../test/harness.js';
import { assertConnectedAppRole, assertNosuperuserNobypassrls } from '../lib/app-role.js';
import { getAppPool, getOwnerPool, resetPools } from '../lib/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const guardSql = fs.readFileSync(
  path.resolve(here, '../../../../db/migrations/20261110240000_app_role_nosuperuser_guard.sql'),
  'utf8'
);

describe('app role NOSUPERUSER NOBYPASSRLS guard', () => {
  let container: { stop: () => Promise<unknown> };

  beforeAll(async () => {
    const pgStack = await startPostgres();
    container = pgStack.container;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: 'http://127.0.0.1:0/mock-oidc',
    });
    await resetPools();
  }, 120_000);

  afterAll(async () => {
    await resetPools();
    await container.stop();
  }, 60_000);

  it('lets the API boot against the app role and refuses the superuser owner', async () => {
    await assertConnectedAppRole();

    const owner = await getOwnerPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );
    expect(owner.rows[0].rolsuper).toBe(true);
    expect(() => assertNosuperuserNobypassrls(owner.rows[0])).toThrow(/NOSUPERUSER/);

    const app = await getAppPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );
    expect(app.rows[0].rolsuper).toBe(false);
    expect(app.rows[0].rolbypassrls).toBe(false);
  });

  it('rejects meeting_assistant_app when it is SUPERUSER without changing role attributes', async () => {
    const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    try {
      await admin.query('ALTER ROLE meeting_assistant_app SUPERUSER');
      await expect(admin.query(guardSql)).rejects.toThrow(/NOSUPERUSER/);

      const attrs = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'meeting_assistant_app'`
      );
      expect(attrs.rows[0].rolsuper).toBe(true);

      await admin.query('ALTER ROLE meeting_assistant_app NOSUPERUSER NOBYPASSRLS');
      await admin.query(guardSql);
      const restored = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'meeting_assistant_app'`
      );
      expect(restored.rows[0].rolsuper).toBe(false);
      expect(restored.rows[0].rolbypassrls).toBe(false);
    } finally {
      await admin.query('ALTER ROLE meeting_assistant_app NOSUPERUSER NOBYPASSRLS').catch(() => undefined);
      await admin.end();
    }
  });
});
