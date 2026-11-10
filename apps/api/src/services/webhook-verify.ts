/**
 * Svix-style Webhook Signature Verification
 * P0-5: Unsigned webhooks get 400; boot fails without secret in production
 * 
 * Recall.ai uses Svix for webhook delivery:
 * - Headers: svix-id, svix-timestamp, svix-signature
 * - Secret format: whsec_<base64>
 * - Signature: HMAC-SHA256 over "${id}.${timestamp}.${rawBody}"
 * - Timestamp tolerance: reject if > 5 minutes old
 */

import crypto from 'crypto';
import { logger } from '../lib/logger.js';

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60; // 5 minutes

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  id?: string;
}

/**
 * Extracts the secret key from Svix-format secret (whsec_base64...)
 */
function decodeSecret(secret: string): Buffer {
  const prefix = 'whsec_';
  if (secret.startsWith(prefix)) {
    return Buffer.from(secret.slice(prefix.length), 'base64');
  }
  return Buffer.from(secret, 'base64');
}

/**
 * Verifies a Recall.ai webhook signature using Svix-style verification
 * 
 * @param rawBody - The raw request body as a string
 * @param headers - Request headers containing svix-id, svix-timestamp, svix-signature
 * @param secret - The webhook secret (RECALL_WEBHOOK_SECRET env var)
 * @returns Verification result with valid flag and optional error
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: {
    'svix-id'?: string;
    'svix-timestamp'?: string;
    'svix-signature'?: string;
    'webhook-id'?: string;
    'webhook-timestamp'?: string;
    'webhook-signature'?: string;
  },
  secret: string
): WebhookVerificationResult {
  // Get headers (Svix uses both svix-* and webhook-* prefixes)
  const msgId = headers['svix-id'] || headers['webhook-id'];
  const msgTimestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const msgSignature = headers['svix-signature'] || headers['webhook-signature'];

  if (!msgId) {
    return { valid: false, error: 'Missing webhook ID header' };
  }

  if (!msgTimestamp) {
    return { valid: false, error: 'Missing webhook timestamp header' };
  }

  if (!msgSignature) {
    return { valid: false, error: 'Missing webhook signature header' };
  }

  // Verify timestamp is not too old or in the future
  const timestamp = parseInt(msgTimestamp, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const now = Math.floor(Date.now() / 1000);
  const timeDiff = now - timestamp;
  
  if (timeDiff > TIMESTAMP_TOLERANCE_SECONDS) {
    logger.warn({ timestamp, now, diff: timeDiff }, 'Webhook timestamp expired');
    return { valid: false, error: 'Webhook timestamp has expired' };
  }
  
  if (timeDiff < -TIMESTAMP_TOLERANCE_SECONDS) {
    logger.warn({ timestamp, now, diff: timeDiff }, 'Webhook timestamp in the future');
    return { valid: false, error: 'Webhook timestamp is in the future' };
  }

  // Build the signed payload: ${id}.${timestamp}.${body}
  const signedPayload = `${msgId}.${msgTimestamp}.${rawBody}`;

  // Decode the secret
  const secretKey = decodeSecret(secret);

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('base64');

  // Signatures can have multiple versions (v1,signature v2,signature)
  // We support v1 signatures
  const signatures = msgSignature.split(' ');
  
  for (const sig of signatures) {
    const [version, value] = sig.split(',');
    
    // We only support v1
    if (version !== 'v1' || !value) {
      continue;
    }

    // Use timing-safe comparison
    try {
      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(value);
      
      if (expectedBuf.length === actualBuf.length && 
          crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        return { valid: true, id: msgId };
      }
    } catch {
      // Buffer length mismatch, continue
    }
  }

  logger.warn('Webhook signature verification failed');
  return { valid: false, error: 'Invalid signature' };
}

/**
 * Checks if the webhook secret is configured
 * In production, this MUST be set - boot should fail otherwise
 */
export function requireWebhookSecret(): string {
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RECALL_WEBHOOK_SECRET must be set in production');
    }
    logger.warn('RECALL_WEBHOOK_SECRET not set - webhook verification disabled in development');
    return '';
  }

  return secret;
}

/**
 * Creates a webhook signature for testing purposes
 * 
 * @param rawBody - The raw request body
 * @param timestamp - Unix timestamp string
 * @param id - Message ID
 * @param secret - The webhook secret
 * @returns Base64-encoded HMAC-SHA256 signature
 */
export function createSignature(
  rawBody: string,
  timestamp: string,
  id: string,
  secret: string
): string {
  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const secretKey = decodeSecret(secret);
  
  return crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('base64');
}
