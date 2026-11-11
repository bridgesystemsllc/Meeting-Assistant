/**
 * Webhook routes
 * P0-5: Svix-style signature verification. Invalid/unsigned webhooks get 400.
 * P1-2: Atomic dedupe via webhookInsertEvent (INSERT...ON CONFLICT RETURNING).
 * P1-3: Fail closed - never skip verification, require secret at startup.
 * P2-1: Persist event before acking; return non-2xx on failure.
 * P2-2: Require event ID header, reject when missing.
 * 
 * Integration with PR #6:
 *   - resolveMeetingTenant(...) → 400 TENANT_MISMATCH on claimed/stored mismatch
 *   - webhookInsertEvent / webhookMarkProcessed (not direct SELECT/INSERT)
 *   - withTenant(resolved.tenant_id, ...) for every meeting row touch
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import { verifyWebhookSignature, requireWebhookSecret } from '../services/webhook-verify.js';
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
import { queueMeetingProcessing } from '../lib/queue.js';

export const webhooksRouter = Router();

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
 * Recall.ai webhook endpoint with Svix signature verification.
 * 
 * Flow:
 * 1. Verify signature (fail-closed, 400 on invalid)
 * 2. Extract and validate event ID header (required, P2-2)
 * 3. Resolve tenant (400 on mismatch)
 * 4. Atomic insert event (dedupe, skip if duplicate)
 * 5. Process event under withTenant
 * 6. Mark processed
 * 7. ACK with 200
 */
webhooksRouter.post('/recall', async (req: Request & { rawBody?: string }, res: Response) => {
  // P1-3: Fail closed - requireWebhookSecret throws at startup if not configured
  const secret = requireWebhookSecret();

  // Step 1: Verify signature (always, fail-closed)
  const headers = {
    'svix-id': req.headers['svix-id'] as string,
    'svix-timestamp': req.headers['svix-timestamp'] as string,
    'svix-signature': req.headers['svix-signature'] as string,
    'webhook-id': req.headers['webhook-id'] as string,
    'webhook-timestamp': req.headers['webhook-timestamp'] as string,
    'webhook-signature': req.headers['webhook-signature'] as string,
  };

  const result = verifyWebhookSignature(req.rawBody || '', headers, secret);

  if (!result.valid) {
    logger.warn({ error: result.error }, 'Webhook signature verification failed');
    return res.status(400).json({ error: result.error });
  }

  // Step 2: P2-2 - Require event ID header, reject when missing
  const eventId = headers['svix-id'] || headers['webhook-id'];
  if (!eventId) {
    logger.warn({}, 'Webhook missing event ID header');
    return res.status(400).json({ error: 'Missing event ID header (svix-id or webhook-id)' });
  }

  const correlation = parseRecallWebhookCorrelation(req.body);
  const { recallBotId, event } = correlation;

  if (!recallBotId) {
    logger.warn({ event }, 'Webhook received without bot ID');
    return res.status(400).json({ error: 'Missing bot ID in payload' });
  }

  if (!event) {
    logger.warn({ botId: recallBotId }, 'Webhook received without event type');
    return res.status(400).json({ error: 'Missing event type in payload' });
  }

  // Step 3: Resolve tenant
  const resolved = await resolveMeetingTenant({
    recallBotId: correlation.recallBotId,
    claimedTenantId: correlation.claimedTenantId,
    claimedMeetingId: correlation.claimedMeetingId,
  });

  if (!resolved.ok) {
    if (resolved.code === 'TENANT_MISMATCH') {
      logger.warn({ botId: recallBotId, event }, 'Webhook tenant mismatch');
      sendError(res, 400, 'TENANT_MISMATCH', 'Webhook tenant does not match meeting');
      return;
    }
    // NOT_FOUND is okay for some events (e.g., bot creation)
    logger.debug({ botId: recallBotId, event }, 'Meeting not found for webhook');
  }

  try {
    // Step 4: P1-2 Atomic insert (dedupe) - returns false if duplicate
    const isNew = await webhookInsertEvent(
      recallBotId,
      event,
      eventId,
      req.body ?? {}
    );

    if (!isNew) {
      // Duplicate event - skip processing but still ACK
      logger.info({ botId: recallBotId, event, eventId }, 'Duplicate webhook, skipping');
      return res.status(200).json({ received: true, duplicate: true });
    }

    logger.info({ event, botId: recallBotId, eventId }, 'Processing webhook');

    // Step 5: Process event under tenant context
    if (resolved.ok) {
      await withTenant(resolved.tenant_id, async (client) => {
        switch (event) {
          case 'bot.status_change':
            await handleStatusChange(client, req.body, resolved.meeting_id);
            break;

          case 'bot.recording_permission_denied':
            await handleConsentDenied(client, resolved.meeting_id, recallBotId);
            break;

          case 'bot.done':
          case 'bot.call_ended':
            await handleCallEnded(client, resolved.meeting_id, recallBotId, resolved.tenant_id);
            break;

          default:
            logger.debug({ event }, 'Unhandled webhook event type');
        }
      });
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
