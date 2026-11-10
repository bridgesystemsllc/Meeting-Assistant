/**
 * PostgreSQL pools for the worker. App role is NOBYPASSRLS.
 * All tenant-owned queries must run inside withTenant.
 */

import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

function poolMax(): number {
  return Number(process.env.PG_POOL_MAX ?? 10);
}

function createPool(connectionString: string | undefined, name: string): pg.Pool {
  const pool = new Pool({
    connectionString,
    max: poolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    logger.error({ err, pool: name }, 'Unexpected error on idle database client');
  });
  return pool;
}

let ownerPool: pg.Pool | undefined;
let appPool: pg.Pool | undefined;

export function getOwnerPool(): pg.Pool {
  if (!ownerPool) {
    ownerPool = createPool(process.env.DATABASE_URL, 'owner');
  }
  return ownerPool;
}

export function getAppPool(): pg.Pool {
  if (!appPool) {
    appPool = createPool(process.env.DATABASE_APP_URL || process.env.DATABASE_URL, 'app');
  }
  return appPool;
}

export async function resetPools(): Promise<void> {
  const closing = [ownerPool?.end(), appPool?.end()];
  ownerPool = undefined;
  appPool = undefined;
  await Promise.all(closing);
}

/**
 * Run `fn` inside a transaction with `app.tenant_id` set locally.
 * Transaction-scoped so pooled connections cannot leak a tenant.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getAppPool().connect();
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
  ): Promise<pg.QueryResult<T>> => getAppPool().query<T>(text, params),

  getClient: async (): Promise<pg.PoolClient> => getAppPool().connect(),

  getAppPool,
  getOwnerPool,
  withTenant,
};
