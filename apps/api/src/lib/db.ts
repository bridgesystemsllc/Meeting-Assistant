/**
 * PostgreSQL database connection pool
 */

import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

export const db = {
  /**
   * Execute a query
   */
  query: async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> => {
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
  },

  /**
   * Get a client from the pool for transactions
   */
  getClient: async (): Promise<pg.PoolClient> => {
    const client = await pool.connect();
    return client;
  },

  /**
   * Execute a transaction
   */
  transaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
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

  /**
   * Check database connectivity
   */
  healthCheck: async (): Promise<boolean> => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Close the pool
   */
  close: async (): Promise<void> => {
    await pool.end();
  },
};

export type Database = typeof db;
