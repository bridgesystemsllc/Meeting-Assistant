/**
 * Migration Tests
 * Verify that migrations apply correctly and produce expected schema.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { startPostgres } from '../test/harness.js';

describe('migrations', () => {
  let container: { stop: () => Promise<unknown> };
  let ownerUrl: string;

  beforeAll(async () => {
    const started = await startPostgres();
    container = started.container;
    ownerUrl = started.ownerUrl;
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('creates tenant_settings with transcript_retention_days column', async () => {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    
    try {
      // Verify column exists and has correct type
      const columnInfo = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'tenant_settings' AND column_name = 'transcript_retention_days'
      `);

      expect(columnInfo.rows.length).toBe(1);
      expect(columnInfo.rows[0].column_name).toBe('transcript_retention_days');
      expect(columnInfo.rows[0].data_type).toBe('integer');
      expect(columnInfo.rows[0].is_nullable).toBe('YES'); // P2-5: nullable
      expect(columnInfo.rows[0].column_default).toBe('365');
    } finally {
      await client.end();
    }
  });

  it('dev tenant has transcript_retention_days = 365', async () => {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    
    try {
      // Query dev tenant settings
      // The dev tenant is created in 001_initial.sql with the dev seed data
      const result = await client.query(`
        SELECT ts.transcript_retention_days 
        FROM tenant_settings ts
        JOIN tenants t ON t.id = ts.tenant_id
        WHERE t.slug = 'dev'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].transcript_retention_days).toBe(365);
    } finally {
      await client.end();
    }
  });

  it('applies all migrations in order without errors', async () => {
    // This test implicitly passes since startPostgres() applies all migrations
    // and beforeAll would have failed if any migration had errors
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    
    try {
      // Verify core tables exist
      const tables = await client.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      
      const tableNames = tables.rows.map(r => r.tablename);
      
      // Verify required tables from migrations
      expect(tableNames).toContain('tenants');
      expect(tableNames).toContain('tenant_settings');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('memberships');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('meetings');
      expect(tableNames).toContain('transcripts');
      expect(tableNames).toContain('meeting_analysis');
      expect(tableNames).toContain('webhook_events');
      expect(tableNames).toContain('email_deliveries');
    } finally {
      await client.end();
    }
  });

  it('retention column was renamed from retention_days', async () => {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    
    try {
      // Verify old column name does NOT exist
      const oldColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tenant_settings' AND column_name = 'retention_days'
      `);

      expect(oldColumn.rows.length).toBe(0);
    } finally {
      await client.end();
    }
  });
});
