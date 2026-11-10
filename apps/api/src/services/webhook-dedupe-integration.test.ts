/**
 * Webhook Deduplication Integration Tests
 * Tests parallel replay protection against Postgres
 * 
 * These tests require DATABASE_URL to be set to run against real Postgres.
 * In CI, Postgres is provided as a service container.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import { createSignature } from './webhook-verify.js';

const TEST_SECRET = 'whsec_' + Buffer.from('test-secret-key-32-bytes').toString('base64');
const _SYNTHETIC_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const hasPostgres = !!process.env.DATABASE_URL;

describe.skipIf(!hasPostgres)('Webhook Deduplication Integration (Postgres)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Ensure webhook_events table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id VARCHAR(255) NOT NULL UNIQUE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query("DELETE FROM webhook_events WHERE webhook_id LIKE 'test-%'");
  });

  async function insertWebhookEvent(webhookId: string, eventType: string, payload: object): Promise<boolean> {
    try {
      await pool.query(
        `INSERT INTO webhook_events (webhook_id, event_type, payload) VALUES ($1, $2, $3)`,
        [webhookId, eventType, JSON.stringify(payload)]
      );
      return true;
    } catch (err: unknown) {
      // Unique constraint violation = duplicate
      if ((err as { code?: string }).code === '23505') {
        return false;
      }
      throw err;
    }
  }

  async function checkDuplicate(webhookId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM webhook_events WHERE webhook_id = $1',
      [webhookId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  describe('5-wide parallel replay', () => {
    it('should accept first webhook and reject 4 parallel duplicates', async () => {
      const webhookId = `test-5wide-${Date.now()}`;
      const payload = { event: 'bot.done', data: { bot: { id: 'bot-5wide' } } };

      // Simulate 5 parallel requests
      const results = await Promise.all(
        Array.from({ length: 5 }, () => insertWebhookEvent(webhookId, 'bot.done', payload))
      );

      // Exactly one should succeed
      const successCount = results.filter(r => r === true).length;
      const failCount = results.filter(r => r === false).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(4);
    });

    it('should handle 5 different webhooks in parallel', async () => {
      const baseTime = Date.now();
      const webhooks = Array.from({ length: 5 }, (_, i) => ({
        id: `test-5diff-${baseTime}-${i}`,
        payload: { event: 'bot.status_change', data: { bot: { id: `bot-${i}` } } },
      }));

      const results = await Promise.all(
        webhooks.map(w => insertWebhookEvent(w.id, 'bot.status_change', w.payload))
      );

      // All should succeed (different webhook IDs)
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('10-wide parallel replay', () => {
    it('should accept first webhook and reject 9 parallel duplicates', async () => {
      const webhookId = `test-10wide-${Date.now()}`;
      const payload = { event: 'bot.done', data: { bot: { id: 'bot-10wide' } } };

      // Simulate 10 parallel requests
      const results = await Promise.all(
        Array.from({ length: 10 }, () => insertWebhookEvent(webhookId, 'bot.done', payload))
      );

      // Exactly one should succeed
      const successCount = results.filter(r => r === true).length;
      const failCount = results.filter(r => r === false).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(9);
    });

    it('should handle interleaved duplicate and unique webhooks', async () => {
      const baseTime = Date.now();
      const duplicateId = `test-10interleaved-dup-${baseTime}`;
      
      // Create mix: 5 duplicates + 5 unique
      const requests = [
        { id: duplicateId, unique: false },
        { id: `test-10interleaved-u1-${baseTime}`, unique: true },
        { id: duplicateId, unique: false },
        { id: `test-10interleaved-u2-${baseTime}`, unique: true },
        { id: duplicateId, unique: false },
        { id: `test-10interleaved-u3-${baseTime}`, unique: true },
        { id: duplicateId, unique: false },
        { id: `test-10interleaved-u4-${baseTime}`, unique: true },
        { id: duplicateId, unique: false },
        { id: `test-10interleaved-u5-${baseTime}`, unique: true },
      ];

      const results = await Promise.all(
        requests.map(r => insertWebhookEvent(r.id, 'bot.done', { test: true }))
      );

      // 5 unique should all succeed, 1 of 5 duplicates should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(6); // 5 unique + 1 duplicate winner
    });
  });

  describe('signature-based deduplication', () => {
    it('should produce consistent signatures for idempotency', async () => {
      const rawBody = JSON.stringify({
        event: 'bot.done',
        data: { bot: { id: 'bot-sig-test' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const webhookId = `test-sig-${Date.now()}`;

      // Generate same signature multiple times
      const signatures = Array.from({ length: 5 }, () =>
        createSignature(rawBody, timestamp, webhookId, TEST_SECRET)
      );

      // All signatures should be identical
      expect(new Set(signatures).size).toBe(1);
    });

    it('should reject replayed webhook even with valid signature', async () => {
      const webhookId = `test-replay-${Date.now()}`;
      const payload = { event: 'bot.done', data: { test: true } };

      // First insert succeeds
      const first = await insertWebhookEvent(webhookId, 'bot.done', payload);
      expect(first).toBe(true);

      // Check it exists
      const exists = await checkDuplicate(webhookId);
      expect(exists).toBe(true);

      // Second attempt with same ID fails
      const second = await insertWebhookEvent(webhookId, 'bot.done', payload);
      expect(second).toBe(false);
    });
  });
});
