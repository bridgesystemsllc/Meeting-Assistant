/**
 * Svix-style webhook signature verification (Recall.ai).
 *
 * - Headers: svix-id / svix-timestamp / svix-signature (or webhook-* aliases)
 * - Secret format: whsec_<base64>
 * - Signature: base64 HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`
 * - Timestamp tolerance: 5 minutes either side of now
 *
 * Fail closed: a missing secret, header, or matching v1 signature is always
 * rejected. The route calls the bound verifier with (rawBody, headers); the
 * secret defaults to requireWebhookSecret().
 */

import crypto from 'node:crypto';
import { logger } from '../lib/logger.js';

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  id?: string;
}

export type WebhookVerifyHeaders = {
  'svix-id'?: string;
  'svix-timestamp'?: string;
  'svix-signature'?: string;
  'webhook-id'?: string;
  'webhook-timestamp'?: string;
  'webhook-signature'?: string;
};

export type WebhookVerifier = (
  rawBody: string,
  headers: WebhookVerifyHeaders
) => WebhookVerificationResult;

/** Throws when RECALL_WEBHOOK_SECRET is unset, in every environment. */
export function requireWebhookSecret(): string {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('RECALL_WEBHOOK_SECRET is required - cannot verify webhooks without it');
  }
  return secret;
}

/**
 * The secret is read from the environment on every call, so there is nothing
 * cached; kept so callers that reset between env changes stay valid.
 */
export function resetWebhookSecretCache(): void {
  // no cache
}

function decodeSecret(secret: string): Buffer {
  const prefix = 'whsec_';
  return Buffer.from(secret.startsWith(prefix) ? secret.slice(prefix.length) : secret, 'base64');
}

/** Base64 HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`. */
export function createSignature(
  rawBody: string,
  timestamp: string,
  id: string,
  secret: string
): string {
  return crypto
    .createHmac('sha256', decodeSecret(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
}

export function verifyWebhookSignature(
  rawBody: string,
  headers: WebhookVerifyHeaders,
  secret: string = requireWebhookSecret()
): WebhookVerificationResult {
  if (!secret) {
    return { valid: false, error: 'verifier_not_configured' };
  }

  const msgId = headers['svix-id'] || headers['webhook-id'];
  const msgTimestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const msgSignature = headers['svix-signature'] || headers['webhook-signature'];

  if (!msgId) {
    return { valid: false, error: 'Missing event ID header (svix-id or webhook-id)' };
  }
  if (!msgTimestamp) {
    return { valid: false, error: 'Missing webhook timestamp header' };
  }
  if (!msgSignature) {
    return { valid: false, error: 'Missing webhook signature header' };
  }

  if (!/^\d+$/.test(msgTimestamp)) {
    return { valid: false, error: 'Invalid webhook timestamp format' };
  }
  const timestamp = Number(msgTimestamp);
  const diff = Math.floor(Date.now() / 1000) - timestamp;
  if (diff > TIMESTAMP_TOLERANCE_SECONDS) {
    logger.warn({ diff }, 'Webhook timestamp expired');
    return { valid: false, error: 'Webhook timestamp has expired' };
  }
  if (diff < -TIMESTAMP_TOLERANCE_SECONDS) {
    logger.warn({ diff }, 'Webhook timestamp in the future');
    return { valid: false, error: 'Webhook timestamp is in the future' };
  }

  const expected = Buffer.from(createSignature(rawBody, msgTimestamp, msgId, secret));
  for (const candidate of msgSignature.split(' ')) {
    const [version, value] = candidate.split(',');
    if (version !== 'v1' || !value) continue;
    const actual = Buffer.from(value);
    if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
      return { valid: true, id: msgId };
    }
  }

  logger.warn('Webhook signature verification failed');
  return { valid: false, error: 'Invalid webhook signature' };
}

/**
 * Bind RECALL_WEBHOOK_SECRET into (rawBody, headers) => result. A missing
 * secret yields a verifier that rejects everything, so the route fails closed
 * without throwing.
 */
export function createWebhookVerifier(): WebhookVerifier {
  let secret: string;
  try {
    secret = requireWebhookSecret();
  } catch {
    return () => ({ valid: false, error: 'verifier_not_configured' });
  }
  return (rawBody, headers) => verifyWebhookSignature(rawBody, headers, secret);
}
