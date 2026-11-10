/**
 * Webhook Deduplication Tests
 * Tests parallel replay protection and idempotency handling
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyWebhookSignature, createSignature } from './webhook-verify.js';

const TEST_SECRET = 'whsec_' + Buffer.from('test-secret-key-32-bytes').toString('base64');

describe('Webhook Deduplication', () => {
  describe('duplicate detection with identical payloads', () => {
    it('should produce identical signatures for identical payloads', () => {
      const rawBody = JSON.stringify({
        event: 'bot.done',
        data: { bot: { id: 'bot-123' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const id = 'msg_test123';

      const sig1 = createSignature(rawBody, timestamp, id, TEST_SECRET);
      const sig2 = createSignature(rawBody, timestamp, id, TEST_SECRET);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different payloads', () => {
      const body1 = JSON.stringify({ event: 'bot.done', data: { bot: { id: 'bot-1' } } });
      const body2 = JSON.stringify({ event: 'bot.done', data: { bot: { id: 'bot-2' } } });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const id = 'msg_test123';

      const sig1 = createSignature(body1, timestamp, id, TEST_SECRET);
      const sig2 = createSignature(body2, timestamp, id, TEST_SECRET);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different message IDs', () => {
      const rawBody = JSON.stringify({ event: 'bot.done', data: {} });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const sig1 = createSignature(rawBody, timestamp, 'msg_1', TEST_SECRET);
      const sig2 = createSignature(rawBody, timestamp, 'msg_2', TEST_SECRET);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('parallel replay scenarios', () => {
    it('should handle multiple verification calls for same webhook', () => {
      const rawBody = JSON.stringify({
        event: 'bot.status_change',
        data: { bot: { id: 'bot-parallel' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const id = 'msg_parallel_test';
      const signature = createSignature(rawBody, timestamp, id, TEST_SECRET);
      const headers = {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      };

      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(verifyWebhookSignature(rawBody, headers, TEST_SECRET));
      }

      expect(results.every(r => r.valid)).toBe(true);
      expect(new Set(results.map(r => r.id)).size).toBe(1);
    });

    it('should reject replayed webhooks with old timestamps', () => {
      const rawBody = JSON.stringify({ event: 'bot.done', data: {} });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
      const id = 'msg_old';
      const signature = createSignature(rawBody, oldTimestamp, id, TEST_SECRET);
      const headers = {
        'svix-id': id,
        'svix-timestamp': oldTimestamp,
        'svix-signature': `v1,${signature}`,
      };

      const result = verifyWebhookSignature(rawBody, headers, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timestamp.*expired/i);
    });

    it('should reject webhooks with future timestamps', () => {
      const rawBody = JSON.stringify({ event: 'bot.done', data: {} });
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString();
      const id = 'msg_future';
      const signature = createSignature(rawBody, futureTimestamp, id, TEST_SECRET);
      const headers = {
        'svix-id': id,
        'svix-timestamp': futureTimestamp,
        'svix-signature': `v1,${signature}`,
      };

      const result = verifyWebhookSignature(rawBody, headers, TEST_SECRET);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/timestamp.*future/i);
    });
  });

  describe('message ID uniqueness', () => {
    it('should extract unique message IDs for deduplication', () => {
      const bodies = [
        { event: 'bot.status_change', data: { bot: { id: 'bot-1' } } },
        { event: 'bot.done', data: { bot: { id: 'bot-1' } } },
        { event: 'bot.done', data: { bot: { id: 'bot-2' } } },
      ];

      const ids = ['msg_1', 'msg_2', 'msg_3'];
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const results = bodies.map((body, i) => {
        const rawBody = JSON.stringify(body);
        const signature = createSignature(rawBody, timestamp, ids[i], TEST_SECRET);
        const headers = {
          'svix-id': ids[i],
          'svix-timestamp': timestamp,
          'svix-signature': `v1,${signature}`,
        };
        return verifyWebhookSignature(rawBody, headers, TEST_SECRET);
      });

      expect(results.every(r => r.valid)).toBe(true);
      const extractedIds = results.map(r => r.id);
      expect(new Set(extractedIds).size).toBe(3);
    });
  });
});

describe('Svix Signature Format', () => {
  it('should accept v1 prefixed signatures', () => {
    const rawBody = JSON.stringify({ test: true });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const id = 'msg_v1test';
    const signature = createSignature(rawBody, timestamp, id, TEST_SECRET);

    const result = verifyWebhookSignature(
      rawBody,
      {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      TEST_SECRET
    );

    expect(result.valid).toBe(true);
  });

  it('should accept multiple signatures and find valid one', () => {
    const rawBody = JSON.stringify({ test: true });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const id = 'msg_multi';
    const validSig = createSignature(rawBody, timestamp, id, TEST_SECRET);

    const result = verifyWebhookSignature(
      rawBody,
      {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,invalid123 v1,${validSig}`,
      },
      TEST_SECRET
    );

    expect(result.valid).toBe(true);
  });

  it('should reject when no valid signature found', () => {
    const rawBody = JSON.stringify({ test: true });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const id = 'msg_invalid';

    const result = verifyWebhookSignature(
      rawBody,
      {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,invalid123 v1,also_invalid`,
      },
      TEST_SECRET
    );

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });
});
