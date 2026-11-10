const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

const db = {
  query: async (text, params) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('DB query executed', { text: text.substring(0, 100), duration, rows: res.rowCount });
      return res;
    } catch (err) {
      logger.error('DB query error', { text: text.substring(0, 100), error: err.message });
      throw err;
    }
  },

  getClient: async () => {
    const client = await pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);
    client.release = () => {
      client.release = release;
      return release();
    };
    return client;
  },

  transaction: async (callback) => {
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
  }
};

module.exports = db;
