import { afterEach, describe, expect, it } from 'vitest';
import {
  createSignature,
  createWebhookVerifier,
  requireWebhookSecret,
  resetWebhookSecretCache,
  verifyWebhookSignature,
} from './webhook-verify.js';

describe('webhook-verify (HMAC)', () => {
  afterEach(() => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    resetWebhookSecretCache();
  });

  it('accepts a payload signed with createSignature', () => {
    const raw = '{"event":"bot.done"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const id = 'evt-1';
    const secret = 'whsec_dGVzdHNlY3JldA==';
    const signature = createSignature(raw, timestamp, id, secret);
    const result = verifyWebhookSignature(
      raw,
      {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      secret,
    );
    expect(result.valid).toBe(true);
    expect(result.id).toBe(id);
  });

  it('rejects a payload with no timestamp', () => {
    const result = verifyWebhookSignature('{"event":"bot.done"}', { 'svix-id': 'evt-1' }, 'whsec_test');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/timestamp/i);
  });

  it('bound verifier rejects when headers are missing', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    const verify = createWebhookVerifier();
    expect(verify('{}', {}).valid).toBe(false);
  });

  it('requireWebhookSecret returns empty string when unset in test', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    expect(requireWebhookSecret()).toBe('');
  });

  it('requireWebhookSecret returns the env value', () => {
    process.env.RECALL_WEBHOOK_SECRET = 'whsec_test';
    expect(requireWebhookSecret()).toBe('whsec_test');
  });
});
