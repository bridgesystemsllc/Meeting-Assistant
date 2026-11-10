import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyWebhookSignature, requireWebhookSecret } from './webhook-verify.js';

describe('verifyWebhookSignature', () => {
  const secret = 'whsec_' + Buffer.from('test-secret-key-32-bytes-long!!').toString('base64');
  const rawBody = '{"event":"bot.status_change","data":{}}';
  const msgId = 'msg_123';

  function generateValidSignature(timestamp: number): string {
    const secretKey = Buffer.from('test-secret-key-32-bytes-long!!');
    const payload = `${msgId}.${timestamp}.${rawBody}`;
    const sig = crypto.createHmac('sha256', secretKey).update(payload).digest('base64');
    return `v1,${sig}`;
  }

  it('accepts valid signature with svix headers', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateValidSignature(timestamp);

    const result = verifyWebhookSignature(rawBody, {
      'svix-id': msgId,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature,
    }, secret);

    expect(result.valid).toBe(true);
  });

  it('accepts valid signature with webhook headers', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateValidSignature(timestamp);

    const result = verifyWebhookSignature(rawBody, {
      'webhook-id': msgId,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': signature,
    }, secret);

    expect(result.valid).toBe(true);
  });

  it('rejects missing ID header', () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const result = verifyWebhookSignature(rawBody, {
      'svix-timestamp': String(timestamp),
      'svix-signature': 'v1,invalid',
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing webhook ID header');
  });

  it('rejects missing timestamp header', () => {
    const result = verifyWebhookSignature(rawBody, {
      'svix-id': msgId,
      'svix-signature': 'v1,invalid',
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing webhook timestamp header');
  });

  it('rejects missing signature header', () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const result = verifyWebhookSignature(rawBody, {
      'svix-id': msgId,
      'svix-timestamp': String(timestamp),
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing webhook signature header');
  });

  it('rejects timestamp too old (> 5 minutes)', () => {
    const timestamp = Math.floor(Date.now() / 1000) - 6 * 60; // 6 minutes ago
    const signature = generateValidSignature(timestamp);

    const result = verifyWebhookSignature(rawBody, {
      'svix-id': msgId,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature,
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Webhook timestamp has expired');
  });

  it('rejects invalid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000);

    const result = verifyWebhookSignature(rawBody, {
      'svix-id': msgId,
      'svix-timestamp': String(timestamp),
      'svix-signature': 'v1,invalidsignature==',
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('rejects tampered body', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateValidSignature(timestamp);
    const tamperedBody = '{"event":"bot.status_change","data":{"hacked":true}}';

    const result = verifyWebhookSignature(tamperedBody, {
      'svix-id': msgId,
      'svix-timestamp': String(timestamp),
      'svix-signature': signature,
    }, secret);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });
});

describe('requireWebhookSecret', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns secret when set', () => {
    process.env.RECALL_WEBHOOK_SECRET = 'whsec_test';
    const secret = requireWebhookSecret();
    expect(secret).toBe('whsec_test');
  });

  it('throws in production when secret not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RECALL_WEBHOOK_SECRET;
    
    expect(() => requireWebhookSecret()).toThrow('RECALL_WEBHOOK_SECRET must be set in production');
  });

  it('returns empty string in development when secret not set', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RECALL_WEBHOOK_SECRET;
    
    const secret = requireWebhookSecret();
    expect(secret).toBe('');
  });
});
