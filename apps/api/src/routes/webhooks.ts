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
import {
  getConsentSettings,
  getStopKeywords,
  mapRecallEventToConsentEvent,
} from '../services/consent.js';
import { announceInCallRecording, handleChatMessage, handleConsentDenial } from '../services/consent-handler.js';
import { recallService } from '../services/recall.js';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function chatMessageFromPayload(payload: unknown): { message: string; senderName?: string } | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data) ?? body;
  if (!data) return null;
  const chat = asRecord(data.chat);
  const participant = asRecord(data.participant);
  const message =
    asString(data.message) ??
    asString(data.text) ??
    asString(data.chat_message) ??
    asString(chat?.message) ??
    asString(chat?.text);
  if (!message) return null;
  const senderName =
    asString(data.speaker) ??
    asString(data.sender_name) ??
    asString(participant?.name) ??
    asString(chat?.sender_name) ??
    undefined;
  return { message, senderName };
}

function isChatEvent(event: string): boolean {
  const normalized = event.toLowerCase();
  return normalized.includes('chat_message') || normalized.endsWith('.chat') || normalized === 'chat';
}

function eventSubCode(payload: unknown): string | null {
  const body = asRecord(payload);
  const data = asRecord(body?.data) ?? body;
  if (!data) return latestStatusCode(payload);
  return (
    asString(data.sub_code) ??
    asString(data.subcode) ??
    asString(data.code) ??
    asString(data.reason) ??
    latestStatusCode(payload)
  );
}

async function applyConsentDenied(
  client: pg.PoolClient,
  event: string,
  payload: unknown,
  meetingId: string,
  tenantId: string,
  recallBotId: string
): Promise<{ enqueue: boolean }> {
  const statusCode = eventSubCode(payload);
  const mapped =
    mapRecallEventToConsentEvent(event, statusCode ?? undefined) ??
    mapRecallEventToConsentEvent(event) ??
    (event === 'bot.recording_permission_denied' ? 'recording_permission_denied' : null) ??
    (event === 'bot.leave_call' && statusCode === 'host_removed' ? 'bot_removed_by_host' : null);

  if (!mapped) {
    return { enqueue: false };
  }

  await client.query(
    "UPDATE meetings SET status = 'consent_denied', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
    [meetingId, tenantId]
  );
  await handleConsentDenial(client, recallService, {
    meetingId,
    tenantId,
    recallBotId,
    eventType: mapped,
    eventSource: event,
  });
  logger.info({ meetingId, eventType: mapped }, 'Consent denial processed');
  return { enqueue: false };
}

async function applyChatMessage(
  client: pg.PoolClient,
  payload: unknown,
  meetingId: string,
  tenantId: string,
  recallBotId: string
): Promise<{ enqueue: boolean }> {
  const chat = chatMessageFromPayload(payload);
  if (!chat) return { enqueue: false };
  const settings = await getConsentSettings(client, tenantId);
  const { triggered } = await handleChatMessage(client, recallService, {
    meetingId,
    tenantId,
    recallBotId,
    message: chat.message,
    senderName: chat.senderName,
    stopKeywords: getStopKeywords(settings),
  });
  if (triggered) {
    await client.query(
      "UPDATE meetings SET status = 'consent_denied', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [meetingId, tenantId]
    );
    logger.info({ meetingId }, 'Stop keyword in chat triggered consent denial');
  }
  return { enqueue: false };
}

async function applyEvent(
  client: pg.PoolClient,
  event: string,
  payload: unknown,
  meetingId: string,
  tenantId: string,
  recallBotId: string
): Promise<{ enqueue: boolean }> {
  const statusCode = eventSubCode(payload);
  const denialType =
    mapRecallEventToConsentEvent(event, statusCode ?? undefined) ??
    (event === 'bot.recording_permission_denied' ? 'recording_permission_denied' : null);

  if (denialType) {
    return applyConsentDenied(client, event, payload, meetingId, tenantId, recallBotId);
  }

  if (isChatEvent(event)) {
    return applyChatMessage(client, payload, meetingId, tenantId, recallBotId);
  }

  switch (event) {
    case 'bot.status_change': {
      const code = statusCode;
      if (!code) return { enqueue: false };
      const status = RECALL_EVENT_TO_STATUS[code] || code;
      await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [status, meetingId, tenantId]
      );
      logger.info({ meetingId, status }, 'Meeting status updated');
      if (code === 'in_call_recording') {
        try {
          await announceInCallRecording(client, recallService, {
            meetingId,
            tenantId,
            recallBotId,
          });
        } catch (err) {
          logger.warn({ err, meetingId }, 'In-call consent announcement failed');
        }
      }
      return { enqueue: false };
    }
    case 'bot.done':
    case 'bot.call_ended': {
      const current = await client.query<{ status: string; consent_status: string | null }>(
        'SELECT status, consent_status FROM meetings WHERE id = $1 AND tenant_id = $2',
        [meetingId, tenantId]
      );
      const row = current.rows[0];
      if (row?.status === 'consent_denied' || row?.consent_status === 'denied') {
        logger.info({ meetingId }, 'Skipping processing enqueue; consent was denied');
        return { enqueue: false };
      }
      await client.query(
        "UPDATE meetings SET status = 'processing', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [meetingId, tenantId]
      );
      return { enqueue: true };
    }
    default: {
      const recordingEvent =
        event === 'bot.in_call_recording' || event === 'in_call_recording';
      if (recordingEvent) {
        await client.query(
          "UPDATE meetings SET status = 'recording', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [meetingId, tenantId]
        );
        try {
          await announceInCallRecording(client, recallService, {
            meetingId,
            tenantId,
            recallBotId,
          });
        } catch (err) {
          logger.warn({ err, meetingId }, 'In-call consent announcement failed');
        }
        return { enqueue: false };
      }
      logger.debug({ event }, 'Unhandled webhook event type');
      return { enqueue: false };
    }
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
      applyEvent(client, event, payload, resolved.meeting_id, resolved.tenant_id, recallBotId)
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
