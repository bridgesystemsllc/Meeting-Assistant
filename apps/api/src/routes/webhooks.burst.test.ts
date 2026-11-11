/**
 * Webhook Burst Tests
 * Route-level integration tests that run against CI Postgres service.
 * Tests concurrent webhook handling for deduplication and atomicity.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import crypto from 'crypto';
import { createSignature } from '../services/webhook-verify.js';

const DATABASE_URL = process.env.DATABASE_URL;
const WEBHOOK_SECRET = process.env.RECALL_WEBHOOK_SECRET || 'whsec_test_secret_for_ci';

// Skip if no database URL (not running in CI)
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('webhook burst tests', () => {
  let app: Express;
  let pool: pg.Pool;
  const testTenantId = '00000000-0000-0000-0000-000000000010';
  const testUserId = '00000000-0000-0000-0000-000000000011';
  let testMeetingId: string;
  let testBotId: string;

  beforeAll(async () => {
    // Connect to CI Postgres
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    
    // Set up environment for the app
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DATABASE_APP_URL = DATABASE_URL;
    process.env.RECALL_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Reset database pools to use new env vars
    const { resetPools } = await import('../lib/db.js');
    await resetPools();
    
    // Import and create the app
    const { createApp } = await import('../app.js');
    app = createApp();
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    // Generate unique IDs for each test
    testMeetingId = crypto.randomUUID();
    testBotId = `bot-burst-${crypto.randomUUID().slice(0, 8)}`;

    // Clean up any previous test data
    await pool.query('DELETE FROM webhook_events WHERE recall_bot_id LIKE $1', ['bot-burst-%']);
    await pool.query('DELETE FROM meetings WHERE id = $1', [testMeetingId]);

    // Insert test meeting
    await pool.query(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status, recall_bot_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testMeetingId, testTenantId, testUserId, 'Burst Test Meeting', 'zoom', 'https://zoom.us/j/123', 'recording', testBotId]
    );
  });

  function createSignedWebhookRequest(
    payload: object,
    eventId: string,
    secret: string = WEBHOOK_SECRET
  ): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSignature(body, timestamp, eventId, secret);

    return {
      body,
      headers: {
        'content-type': 'application/json',
        'svix-id': eventId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
    };
  }

  function createBotDonePayload(botId: string, meetingId: string, tenantId: string) {
    return {
      event: 'bot.done',
      data: {
        bot: {
          id: botId,
          status_changes: [{ code: 'done', created_at: new Date().toISOString() }],
          metadata: {
            internal_meeting_id: meetingId,
            tenant_id: tenantId,
          },
        },
      },
    };
  }

  it('burst_5_wide: exactly 1 webhook_events row from 5 concurrent identical webhooks', async () => {
    const eventId = `evt-burst5-${crypto.randomUUID().slice(0, 8)}`;
    const payload = createBotDonePayload(testBotId, testMeetingId, testTenantId);
    const { body, headers } = createSignedWebhookRequest(payload, eventId);

    // Fire 5 concurrent identical webhooks
    const results = await Promise.all(
      Array(5).fill(null).map(() =>
        request(app)
          .post('/webhooks/recall')
          .set(headers)
          .send(body)
      )
    );

    // All should return 200
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // Check exactly 1 webhook_events row
    const eventCount = await pool.query(
      'SELECT COUNT(*)::int as count FROM webhook_events WHERE recall_bot_id = $1 AND event_id = $2',
      [testBotId, eventId]
    );
    expect(eventCount.rows[0].count).toBe(1);

    // Exactly 1 non-duplicate response
    const nonDuplicates = results.filter(r => !r.body.duplicate);
    expect(nonDuplicates.length).toBe(1);
  });

  it('burst_10_wide: exactly 1 webhook_events row from 10 concurrent identical webhooks', async () => {
    const eventId = `evt-burst10-${crypto.randomUUID().slice(0, 8)}`;
    const payload = createBotDonePayload(testBotId, testMeetingId, testTenantId);
    const { body, headers } = createSignedWebhookRequest(payload, eventId);

    // Fire 10 concurrent identical webhooks
    const results = await Promise.all(
      Array(10).fill(null).map(() =>
        request(app)
          .post('/webhooks/recall')
          .set(headers)
          .send(body)
      )
    );

    // All should return 200
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // Check exactly 1 webhook_events row
    const eventCount = await pool.query(
      'SELECT COUNT(*)::int as count FROM webhook_events WHERE recall_bot_id = $1 AND event_id = $2',
      [testBotId, eventId]
    );
    expect(eventCount.rows[0].count).toBe(1);

    // Exactly 1 non-duplicate response
    const nonDuplicates = results.filter(r => !r.body.duplicate);
    expect(nonDuplicates.length).toBe(1);
  });

  it('missing_signature_returns_400: rejects webhook without signature', async () => {
    const payload = createBotDonePayload(testBotId, testMeetingId, testTenantId);
    
    const res = await request(app)
      .post('/webhooks/recall')
      .set('content-type', 'application/json')
      .set('svix-id', 'evt-nosig')
      .set('svix-timestamp', Math.floor(Date.now() / 1000).toString())
      // No svix-signature header
      .send(JSON.stringify(payload));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error)).toMatch(/signature/i);
  });

  it('missing_event_id_rejected: rejects webhook without event ID header', async () => {
    const payload = createBotDonePayload(testBotId, testMeetingId, testTenantId);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSignature(body, timestamp, 'dummy-id', WEBHOOK_SECRET);

    const res = await request(app)
      .post('/webhooks/recall')
      .set('content-type', 'application/json')
      // No svix-id or webhook-id header
      .set('svix-timestamp', timestamp)
      .set('svix-signature', `v1,${signature}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error)).toMatch(/signature|id/i);
  });

  it('invalid_signature_returns_400: rejects webhook with wrong signature', async () => {
    const eventId = `evt-badsig-${crypto.randomUUID().slice(0, 8)}`;
    const payload = createBotDonePayload(testBotId, testMeetingId, testTenantId);
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const res = await request(app)
      .post('/webhooks/recall')
      .set('content-type', 'application/json')
      .set('svix-id', eventId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,invalid_signature_here')
      .send(body);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error)).toMatch(/signature/i);
  });
});

describe('webhook secret startup validation', () => {
  it('unset_secret_fails_startup: requireWebhookSecret throws when secret not set in non-test env', async () => {
    // This test verifies the fail-closed behavior documented in P1-3
    // In test environment, missing secret returns empty string
    // In production/development, it should throw
    
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.RECALL_WEBHOOK_SECRET;
    
    try {
      // Clear cached secret and env
      const { resetWebhookSecretCache, requireWebhookSecret } = await import('../services/webhook-verify.js');
      resetWebhookSecretCache();
      
      delete process.env.RECALL_WEBHOOK_SECRET;
      process.env.NODE_ENV = 'production';
      
      // Should throw in production without secret
      expect(() => requireWebhookSecret()).toThrow('RECALL_WEBHOOK_SECRET is required');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.RECALL_WEBHOOK_SECRET = originalSecret;
    }
  });
});
