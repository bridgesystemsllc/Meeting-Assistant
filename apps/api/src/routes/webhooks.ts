/**
 * Recall webhook routes.
 *
 * 1. Verify the Svix HMAC signature before any DB access (fail closed, 400
 *    BAD_SIGNATURE). The raw body is captured by express.raw in app.ts.
 * 2. Resolve the meeting tenant through the SECURITY DEFINER lookup. After a
 *    valid signature, an unknown or mismatched tenant still ACKs 200
 *    { received: true } and writes nothing (no TENANT_MISMATCH oracle).
 * 3. Record the event atomically (webhook_insert_event); a duplicate ACKs
 *    200 { received: true, duplicate: true } and is not reprocessed.
 * 4. Apply the event under withTenant, enqueue processing on bot.done /
 *    bot.call_ended, then mark the event processed.
 * 5. Unexpected failures return 500 so Recall retries.
 */

import { Router, type Request } from 'express';
import type pg from 'pg';
import { RECALL_EVENT_TO_STATUS } from '@meeting-assistant/shared';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { sendError } from '../lib/http-error.js';
import { queueMeetingProcessing } from '../lib/queue.js';
import {
  parseRecallWebhookCorrelation,
  resolveMeetingTenant,
  webhookInsertEvent,
  webhookMarkProcessed,
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

function latestStatusCode(payload: unknown): string | null {
  const data = (payload as { data?: { bot?: { status_changes?: unknown } } } | null)?.data;
  const changes = data?.bot?.status_changes;
  if (!Array.isArray(changes) || changes.length === 0) return null;
  const code = (changes[changes.length - 1] as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

async function applyEvent(
  client: pg.PoolClient,
  event: string,
  payload: unknown,
  meetingId: string,
  tenantId: string
): Promise<{ enqueue: boolean }> {
  switch (event) {
    case 'bot.status_change': {
      const code = latestStatusCode(payload);
      if (!code) return { enqueue: false };
      const status = RECALL_EVENT_TO_STATUS[code] || code;
      await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [status, meetingId, tenantId]
      );
      logger.info({ meetingId, status }, 'Meeting status updated');
      return { enqueue: false };
    }
    case 'bot.recording_permission_denied':
      await client.query(
        "UPDATE meetings SET status = 'consent_denied', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [meetingId, tenantId]
      );
      logger.info({ meetingId }, 'Meeting marked consent_denied');
      return { enqueue: false };
    case 'bot.done':
    case 'bot.call_ended':
      await client.query(
        "UPDATE meetings SET status = 'processing', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [meetingId, tenantId]
      );
      return { enqueue: true };
    default:
      logger.debug({ event }, 'Unhandled webhook event type');
      return { enqueue: false };
  }
}

/**
 * POST /webhooks/recall
 */
webhooksRouter.post('/recall', async (req, res) => {
  const raw = rawBody(req);
  const verified = webhookVerify.createWebhookVerifier()(raw, webhookHeaders(req));
  if (!verified.valid) {
    sendError(res, 400, 'BAD_SIGNATURE', verified.error || 'Invalid webhook signature');
    return;
  }

  const payload = parsePayload(raw);
  const correlation = parseRecallWebhookCorrelation(payload);
  const { recallBotId, event } = correlation;
  const eventId = verified.id || headerValue(req, 'svix-id') || headerValue(req, 'webhook-id');

  if (!recallBotId || !event || !eventId) {
    logger.warn({ event, hasBot: Boolean(recallBotId) }, 'Webhook missing bot id or event type');
    res.status(200).json({ received: true });
    return;
  }

  try {
    const resolved = await resolveMeetingTenant({
      recallBotId,
      claimedTenantId: correlation.claimedTenantId,
      claimedMeetingId: correlation.claimedMeetingId,
    });
    if (!resolved.ok) {
      logger.warn({ event }, 'Webhook meeting not resolved');
      res.status(200).json({ received: true });
      return;
    }

    const inserted = await webhookInsertEvent(recallBotId, event, eventId, payload ?? {});
    if (!inserted) {
      logger.info({ event, eventId }, 'Duplicate webhook, skipping');
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    const { enqueue } = await withTenant(resolved.tenant_id, (client) =>
      applyEvent(client, event, payload, resolved.meeting_id, resolved.tenant_id)
    );
    if (enqueue) {
      await queueMeetingProcessing(resolved.meeting_id, recallBotId, resolved.tenant_id);
      logger.info({ meetingId: resolved.meeting_id }, 'Call ended, enqueued for processing');
    }

    await webhookMarkProcessed(recallBotId, event, eventId);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err, event, eventId }, 'Error processing webhook after verified signature');
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});
