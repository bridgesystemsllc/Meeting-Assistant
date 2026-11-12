import { afterEach, describe, expect, it } from 'vitest';
import {
  createSignature,
  createWebhookVerifier,
  requireWebhookSecret,
  verifyWebhookSignature,
} from './webhook-verify.js';

// Obviously fake, low-entropy fixture secret. Never a real credential.
const FAKE_SECRET = 'whsec_test';

function now(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function signedHeaders(raw: string, id: string, secret = FAKE_SECRET, timestamp = now()) {
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${createSignature(raw, timestamp, id, secret)}`,
  };
}

describe('webhook-verify (HMAC, fail closed)', () => {
  afterEach(() => {
    delete process.env.RECALL_WEBHOOK_SECRET;
  });

  it('accepts a payload signed with the shared secret', () => {
    const raw = '{"event":"bot.done"}';
    const result = verifyWebhookSignature(raw, signedHeaders(raw, 'evt-1'), FAKE_SECRET);
    expect(result).toEqual({ valid: true, id: 'evt-1' });
  });

  it('accepts webhook-* header aliases', () => {
    const raw = '{"event":"bot.done"}';
    const h = signedHeaders(raw, 'evt-alias');
    const result = verifyWebhookSignature(
      raw,
      {
        'webhook-id': h['svix-id'],
        'webhook-timestamp': h['svix-timestamp'],
        'webhook-signature': h['svix-signature'],
      },
      FAKE_SECRET
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a payload signed with a different secret', () => {
    const raw = '{"event":"bot.done"}';
    const result = verifyWebhookSignature(
      raw,
      signedHeaders(raw, 'evt-1', 'whsec_other'),
      FAKE_SECRET
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });

  it('rejects a tampered body', () => {
    const raw = '{"event":"bot.done"}';
    const headers = signedHeaders(raw, 'evt-1');
    const result = verifyWebhookSignature('{"event":"bot.fatal"}', headers, FAKE_SECRET);
    expect(result.valid).toBe(false);
  });

  it('rejects missing id, timestamp, and signature headers', () => {
    const raw = '{}';
    const h = signedHeaders(raw, 'evt-1');
    expect(
      verifyWebhookSignature(raw, { 'svix-timestamp': h['svix-timestamp'], 'svix-signature': h['svix-signature'] }, FAKE_SECRET).error
    ).toMatch(/event ID/);
    expect(
      verifyWebhookSignature(raw, { 'svix-id': 'evt-1', 'svix-signature': h['svix-signature'] }, FAKE_SECRET).error
    ).toMatch(/timestamp/i);
    expect(
      verifyWebhookSignature(raw, { 'svix-id': 'evt-1', 'svix-timestamp': h['svix-timestamp'] }, FAKE_SECRET).error
    ).toMatch(/signature/i);
  });

  it('rejects stale timestamps even with a correct signature', () => {
    const raw = '{}';
    const stale = (Math.floor(Date.now() / 1000) - 600).toString();
    const result = verifyWebhookSignature(raw, signedHeaders(raw, 'evt-1', FAKE_SECRET, stale), FAKE_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('rejects when the secret is empty', () => {
    const raw = '{}';
    const result = verifyWebhookSignature(raw, signedHeaders(raw, 'evt-1', ''), '');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('verifier_not_configured');
  });

  it('defaults the secret to RECALL_WEBHOOK_SECRET', () => {
    process.env.RECALL_WEBHOOK_SECRET = FAKE_SECRET;
    const raw = '{"ok":true}';
    expect(verifyWebhookSignature(raw, signedHeaders(raw, 'evt-2')).valid).toBe(true);
  });

  it('bound verifier rejects everything when the secret is missing', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    const verify = createWebhookVerifier();
    const raw = '{}';
    expect(verify(raw, signedHeaders(raw, 'evt-1')).valid).toBe(false);
    expect(verify(raw, {}).error).toBe('verifier_not_configured');
  });

  it('bound verifier accepts correctly signed payloads and rejects forgeries', () => {
    process.env.RECALL_WEBHOOK_SECRET = FAKE_SECRET;
    const verify = createWebhookVerifier();
    const raw = '{"ok":true}';
    expect(verify(raw, signedHeaders(raw, 'evt-3')).valid).toBe(true);
    expect(verify(raw, { ...signedHeaders(raw, 'evt-3'), 'svix-signature': 'v1,abc' }).valid).toBe(false);
  });

  it('requireWebhookSecret throws when unset', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    expect(() => requireWebhookSecret()).toThrow(/RECALL_WEBHOOK_SECRET/);
  });

  it('requireWebhookSecret returns the env value', () => {
    process.env.RECALL_WEBHOOK_SECRET = FAKE_SECRET;
    expect(requireWebhookSecret()).toBe(FAKE_SECRET);
  });
});
