/**
 * PostgreSQL pool for the worker. Uses the NOBYPASSRLS app role only.
 * All tenant-owned queries must run inside withTenant.
 */

import pg from 'pg';
import { logger } from './logger.js';
import { appDatabaseUrl } from './env.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: appDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle database client');
    });
  }
  return pool;
}

export function getAppPool(): pg.Pool {
  return getPool();
}

export async function resetPools(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Run `fn` inside a transaction with `app.tenant_id` set locally.
 * Transaction-scoped so pooled connections cannot leak a tenant.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

export const db = {
  query: async <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> => {
    const start = Date.now();
    try {
      const result = await getPool().query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug({ query: text.substring(0, 100), duration, rows: result.rowCount }, 'DB query executed');
      return result;
    } catch (err) {
      logger.error({ query: text.substring(0, 100), err }, 'DB query error');
      throw err;
    }
  },

  getClient: async (): Promise<pg.PoolClient> => getPool().connect(),

  getAppPool,
  withTenant,

  transaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
