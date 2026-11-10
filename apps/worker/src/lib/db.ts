/**
 * PostgreSQL pool for the worker. Uses the NOBYPASSRLS app role only.
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
