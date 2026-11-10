/**
 * PostgreSQL pools: owner (migrations) and app (NOBYPASSRLS).
 * Tenant context is transaction-local via set_config(..., true).
 * Pools are created lazily so tests can set DATABASE_URL first.
 */

import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

function poolMax(): number {
  return Number(process.env.PG_POOL_MAX ?? 20);
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

/** Test hook: drop cached pools after env changes. */
export async function resetPools(): Promise<void> {
  const closing = [ownerPool?.end(), appPool?.end()];
  ownerPool = undefined;
  appPool = undefined;
  await Promise.all(closing);
}

async function queryOn<T extends pg.QueryResultRow = pg.QueryResultRow>(
  pool: pg.Pool,
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug({ query: text.substring(0, 100), duration, rows: result.rowCount }, 'DB query executed');
    return result;
  } catch (err) {
    logger.error({ query: text.substring(0, 100), err }, 'DB query error');
    throw err;
  }
}

/**
 * Run `fn` inside a transaction with `app.tenant_id` set locally.
 * The setting is transaction-scoped so pooled connections cannot leak a tenant.
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
  ): Promise<pg.QueryResult<T>> => queryOn<T>(getAppPool(), text, params),

  ownerQuery: async <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<pg.QueryResult<T>> => queryOn<T>(getOwnerPool(), text, params),

  getClient: async (): Promise<pg.PoolClient> => getAppPool().connect(),

  getAppPool,
  getOwnerPool,

  transaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await getAppPool().connect();
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

  healthCheck: async (): Promise<boolean> => {
    try {
      await getAppPool().query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },

  close: async (): Promise<void> => {
    await resetPools();
  },
};

export type Database = typeof db;
