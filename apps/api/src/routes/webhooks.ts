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
import { RECALL_EVENT_TO_STATUS } from '@meeting-assistant/shared';
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

/**
 * P1-1: Mount express.raw BEFORE global JSON parser to capture raw body for signature verification.
 * The main app must NOT mount express.json() before this route.
 */
webhooksRouter.use(
  '/recall',
  express.raw({ type: '*/*', limit: '10mb' }),
  (req: Request, _res: Response, next) => {
    // Store raw body for signature verification
    if (Buffer.isBuffer(req.body)) {
      (req as Request & { rawBody: string }).rawBody = req.body.toString('utf8');
      try {
        req.body = JSON.parse((req as Request & { rawBody: string }).rawBody);
      } catch {
        req.body = {};
      }
    }
    next();
  }
);

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

    if (!isNew) {
      // Duplicate event - skip processing but still ACK
      logger.info({ botId: recallBotId, event, eventId }, 'Duplicate webhook, skipping');
      return res.status(200).json({ received: true, duplicate: true });
    }

    logger.info({ event, botId: recallBotId, eventId }, 'Processing webhook');

    // Step 5: Process event under tenant context
    if (resolved.ok) {
      await withTenant(resolved.tenant_id, async (client) => {
        await client.query('SELECT id FROM meetings WHERE id = $1 AND tenant_id = $2', [
          resolved.meeting_id,
          resolved.tenant_id,
        ]);
      });
    } else {
      logger.warn({ event: correlation.event }, 'Webhook meeting not resolved');
    }

    // Step 6: Mark as processed
    await webhookMarkProcessed(recallBotId, event, eventId);

    // Step 7: ACK
    return res.status(200).json({ received: true });

  } catch (err) {
    // P2-1: Return non-2xx on failure so Recall retries
    logger.error({ err, event, botId: recallBotId, eventId }, 'Error processing webhook');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

interface DbClient {
  query: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
}

async function handleStatusChange(
  client: DbClient,
  payload: Record<string, unknown>,
  meetingId: string
): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const statusChanges = bot?.status_changes as Array<{ code: string }>;

  if (!statusChanges?.length) return;

  const latestStatus = statusChanges[statusChanges.length - 1].code;
  const dbStatus = RECALL_EVENT_TO_STATUS[latestStatus] || latestStatus;

  await client.query(
    `UPDATE meetings 
     SET status = $1, recall_bot_id = $2, updated_at = NOW() 
     WHERE id = $3`,
    [dbStatus, botId, meetingId]
  );
  logger.info({ meetingId, status: dbStatus }, 'Meeting status updated');
}

async function handleConsentDenied(
  client: DbClient,
  meetingId: string,
  botId: string
): Promise<void> {
  await client.query(
    `UPDATE meetings 
     SET status = 'consent_denied', updated_at = NOW() 
     WHERE id = $1`,
    [meetingId]
  );
  logger.info({ meetingId, botId }, 'Meeting marked consent_denied');
}

async function handleCallEnded(
  client: DbClient,
  meetingId: string,
  botId: string,
  tenantId: string
): Promise<void> {
  await client.query(
    `UPDATE meetings 
     SET status = 'processing', updated_at = NOW() 
     WHERE id = $1`,
    [meetingId]
  );

  // P1-6: Enqueue process-meeting job with jobId for dedupe
  await queueMeetingProcessing(meetingId, botId, tenantId);

  logger.info({ meetingId, botId }, 'Call ended, enqueued for processing');
}
