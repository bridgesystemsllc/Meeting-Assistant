/**
 * Webhook routes.
 *
 * Signature verification is fail-closed. The bound verifier is
 * (rawBody, headers) => WebhookVerificationResult; the secret is captured
 * from requireWebhookSecret(). Default verifyWebhookSignature rejects every
 * payload. FORGE Phase 1 (PR #3) replaces apps/api/src/services/webhook-verify.ts
 * in place — same path, same exports.
 *
 * Verify runs before any DB access. After a valid signature the HTTP status
 * is always 200 { received: true } (no TENANT_MISMATCH oracle).
 */

import { Router, type Request } from 'express';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { sendError } from '../lib/http-error.js';
import {
  parseRecallWebhookCorrelation,
  resolveMeetingTenant,
  webhookInsertEvent,
} from '../lib/tenant-lookup.js';
import * as webhookVerify from '../services/webhook-verify.js';
import type { WebhookVerifyHeaders } from '../services/webhook-verify.js';

export const webhooksRouter = Router();

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function webhookHeaders(req: Request): WebhookVerifyHeaders {
  return {
    'svix-id': headerValue(req, 'svix-id'),
    'svix-timestamp': headerValue(req, 'svix-timestamp'),
    'svix-signature': headerValue(req, 'svix-signature'),
    'webhook-id': headerValue(req, 'webhook-id'),
    'webhook-timestamp': headerValue(req, 'webhook-timestamp'),
    'webhook-signature': headerValue(req, 'webhook-signature'),
  };
}

function rawBody(req: Request): string {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

function parsePayload(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * POST /webhooks/recall
 * 1. Verify signature (fail closed).
 * 2. Resolve tenant via SECURITY DEFINER.
 * 3. withTenant for every meeting row touch.
 */
webhooksRouter.post('/recall', async (req, res) => {
  const raw = rawBody(req);
  const verified = webhookVerify.createWebhookVerifier()(raw, webhookHeaders(req));
  if (!verified.valid) {
    sendError(res, 400, 'BAD_SIGNATURE', 'Invalid webhook signature');
    return;
  }

  const payload = parsePayload(raw);
  const correlation = parseRecallWebhookCorrelation(payload);
  const eventId =
    verified.id ||
    headerValue(req, 'svix-id') ||
    headerValue(req, 'webhook-id') ||
    `${correlation.recallBotId ?? 'unknown'}-${correlation.event ?? 'event'}`;

  if (correlation.recallBotId || correlation.claimedMeetingId) {
    const resolved = await resolveMeetingTenant({
      recallBotId: correlation.recallBotId,
      claimedTenantId: correlation.claimedTenantId,
      claimedMeetingId: correlation.claimedMeetingId,
    });

    if (resolved.ok) {
      if (correlation.recallBotId && correlation.event) {
        await webhookInsertEvent(
          correlation.recallBotId,
          correlation.event,
          eventId,
          payload ?? {}
        );
      }

      await withTenant(resolved.tenant_id, async (client) => {
        await client.query('SELECT id FROM meetings WHERE id = $1 AND tenant_id = $2', [
          resolved.meeting_id,
          resolved.tenant_id,
        ]);
      });
    } else if (resolved.code === 'TENANT_MISMATCH') {
      logger.warn({ event: correlation.event }, 'Webhook tenant mismatch');
    }
  }

  res.status(200).json({ received: true });
});
