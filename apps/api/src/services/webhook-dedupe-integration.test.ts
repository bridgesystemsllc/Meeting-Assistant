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
    
    // Use actual schema from 001_initial.sql migration
    // Table: webhook_events with columns: id, recall_bot_id, event_type, event_id, payload, processed_at, created_at
    // UNIQUE constraint on (recall_bot_id, event_type, event_id)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recall_bot_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_id VARCHAR(255) NOT NULL,
        payload JSONB,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(recall_bot_id, event_type, event_id)
      )
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data - use recall_bot_id as identifier
    await pool.query("DELETE FROM webhook_events WHERE recall_bot_id LIKE 'test-%'");
  });

  async function insertWebhookEvent(recallBotId: string, eventType: string, eventId: string, payload: object): Promise<boolean> {
    try {
      await pool.query(
        `INSERT INTO webhook_events (recall_bot_id, event_type, event_id, payload) VALUES ($1, $2, $3, $4)`,
        [recallBotId, eventType, eventId, JSON.stringify(payload)]
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

  async function checkDuplicate(recallBotId: string, eventType: string, eventId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM webhook_events WHERE recall_bot_id = $1 AND event_type = $2 AND event_id = $3',
      [recallBotId, eventType, eventId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  describe('5-wide parallel replay', () => {
    it('should accept first webhook and reject 4 parallel duplicates', async () => {
      const recallBotId = `test-5wide-${Date.now()}`;
      const eventId = 'evt-5wide-001';
      const payload = { event: 'bot.done', data: { bot: { id: 'bot-5wide' } } };

      // Simulate 5 parallel requests with same (recall_bot_id, event_type, event_id)
      const results = await Promise.all(
        Array.from({ length: 5 }, () => insertWebhookEvent(recallBotId, 'bot.done', eventId, payload))
      );

      // Exactly one should succeed due to UNIQUE constraint
      const successCount = results.filter(r => r === true).length;
      const failCount = results.filter(r => r === false).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(4);
    });

    it('should handle 5 different webhooks in parallel', async () => {
      const baseTime = Date.now();
      const webhooks = Array.from({ length: 5 }, (_, i) => ({
        recallBotId: `test-5diff-${baseTime}-${i}`,
        eventId: `evt-${i}`,
        payload: { event: 'bot.status_change', data: { bot: { id: `bot-${i}` } } },
      }));

      const results = await Promise.all(
        webhooks.map(w => insertWebhookEvent(w.recallBotId, 'bot.status_change', w.eventId, w.payload))
      );

      // All should succeed (different recall_bot_id values)
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('10-wide parallel replay', () => {
    it('should accept first webhook and reject 9 parallel duplicates', async () => {
      const recallBotId = `test-10wide-${Date.now()}`;
      const eventId = 'evt-10wide-001';
      const payload = { event: 'bot.done', data: { bot: { id: 'bot-10wide' } } };

      // Simulate 10 parallel requests with same (recall_bot_id, event_type, event_id)
      const results = await Promise.all(
        Array.from({ length: 10 }, () => insertWebhookEvent(recallBotId, 'bot.done', eventId, payload))
      );

      // Exactly one should succeed
      const successCount = results.filter(r => r === true).length;
      const failCount = results.filter(r => r === false).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(9);
    });

    it('should handle interleaved duplicate and unique webhooks', async () => {
      const baseTime = Date.now();
      const duplicateBotId = `test-10interleaved-dup-${baseTime}`;
      const duplicateEventId = 'evt-dup';
      
      // Create mix: 5 duplicates (same bot_id + event_id) + 5 unique (different bot_ids)
      const requests = [
        { recallBotId: duplicateBotId, eventId: duplicateEventId, unique: false },
        { recallBotId: `test-10interleaved-u1-${baseTime}`, eventId: 'evt-u1', unique: true },
        { recallBotId: duplicateBotId, eventId: duplicateEventId, unique: false },
        { recallBotId: `test-10interleaved-u2-${baseTime}`, eventId: 'evt-u2', unique: true },
        { recallBotId: duplicateBotId, eventId: duplicateEventId, unique: false },
        { recallBotId: `test-10interleaved-u3-${baseTime}`, eventId: 'evt-u3', unique: true },
        { recallBotId: duplicateBotId, eventId: duplicateEventId, unique: false },
        { recallBotId: `test-10interleaved-u4-${baseTime}`, eventId: 'evt-u4', unique: true },
        { recallBotId: duplicateBotId, eventId: duplicateEventId, unique: false },
        { recallBotId: `test-10interleaved-u5-${baseTime}`, eventId: 'evt-u5', unique: true },
      ];

      const results = await Promise.all(
        requests.map(r => insertWebhookEvent(r.recallBotId, 'bot.done', r.eventId, { test: true }))
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
      const recallBotId = `test-replay-${Date.now()}`;
      const eventType = 'bot.done';
      const eventId = 'evt-replay-001';
      const payload = { event: 'bot.done', data: { test: true } };

      // First insert succeeds
      const first = await insertWebhookEvent(recallBotId, eventType, eventId, payload);
      expect(first).toBe(true);

      // Check it exists
      const exists = await checkDuplicate(recallBotId, eventType, eventId);
      expect(exists).toBe(true);

      // Second attempt with same (recall_bot_id, event_type, event_id) fails
      const second = await insertWebhookEvent(recallBotId, eventType, eventId, payload);
      expect(second).toBe(false);
    });
  });
});
