import { afterEach, describe, expect, it } from 'vitest';
import {
  createWebhookVerifier,
  requireWebhookSecret,
  verifyWebhookSignature,
} from './webhook-verify.js';

describe('webhook-verify (fail-closed stub)', () => {
  afterEach(() => {
    delete process.env.RECALL_WEBHOOK_SECRET;
  });

  it('rejects every payload, even when a secret is set', () => {
    const result = verifyWebhookSignature('{"event":"bot.done"}', { 'svix-id': 'evt-1' }, 'whsec_test');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('verifier_not_configured');
  });

  it('bound verifier rejects when the secret is missing', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    const verify = createWebhookVerifier();
    expect(verify('{}', {}).valid).toBe(false);
    expect(verify('{}', {}).error).toBe('verifier_not_configured');
  });

  it('bound verifier still rejects after binding a secret (until FORGE drops in)', () => {
    process.env.RECALL_WEBHOOK_SECRET = 'whsec_test';
    const verify = createWebhookVerifier();
    expect(verify('{"ok":true}', { 'svix-signature': 'v1,abc' }).valid).toBe(false);
  });

  it('requireWebhookSecret throws when unset', () => {
    delete process.env.RECALL_WEBHOOK_SECRET;
    expect(() => requireWebhookSecret()).toThrow(/RECALL_WEBHOOK_SECRET/);
  });

  it('requireWebhookSecret returns the env value', () => {
    process.env.RECALL_WEBHOOK_SECRET = 'whsec_test';
    expect(requireWebhookSecret()).toBe('whsec_test');
  });
});
