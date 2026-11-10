/**
 * Webhook routes
 * P0-5: Svix-style signature verification. Invalid/unsigned webhooks get 400.
 * P0-6: Consent denial handling with auto-leave and cleanup.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { verifyWebhookSignature, requireWebhookSecret } from '../services/webhook-verify.js';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { RECALL_EVENT_TO_STATUS } from '@meeting-assistant/shared';
import { recallService } from '../services/recall.js';
import {
  getConsentSettings,
  getStopKeywords,
  containsStopKeyword,
  insertConsentEvent,
  updateMeetingConsentStatus,
  deleteStoredMeetingData,
  type ConsentEventType,
} from '../services/consent.js';
import { handleConsentDenial as processConsentDenial } from '../services/consent-handler.js';

export const webhooksRouter = Router();

// Raw body middleware for signature verification
webhooksRouter.use('/recall', (req: Request, res: Response, next: NextFunction) => {
  let rawBody = '';
  req.setEncoding('utf8');
  
  req.on('data', (chunk: string) => {
    rawBody += chunk;
  });
  
  req.on('end', () => {
    (req as Request & { rawBody: string }).rawBody = rawBody;
    try {
      req.body = JSON.parse(rawBody);
    } catch {
      req.body = {};
    }
    next();
  });
});

/**
 * POST /webhooks/recall
 * Recall.ai webhook endpoint with Svix signature verification
 */
webhooksRouter.post('/recall', async (req: Request & { rawBody?: string }, res: Response) => {
  const secret = requireWebhookSecret();

  // Verify signature if secret is configured
  if (secret) {
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
  }

  // Always respond 200 immediately to prevent retries
  res.status(200).json({ received: true });

  const payload = req.body;
  const event = payload.event;
  const botId = payload.data?.bot?.id;

  if (!botId) {
    logger.warn({ event }, 'Webhook received without bot ID');
    return;
  }

  // Get event ID for idempotency
  const eventId = req.headers['svix-id'] as string || 
                  req.headers['webhook-id'] as string ||
                  `${botId}-${event}-${Date.now()}`;

  try {
    // Check for duplicate (DB idempotency)
    const existing = await db.query(
      `SELECT id FROM webhook_events 
       WHERE recall_bot_id = $1 AND event_type = $2 AND event_id = $3`,
      [botId, event, eventId]
    );

    if (existing.rows.length > 0) {
      logger.info({ botId, event, eventId }, 'Duplicate webhook, skipping');
      return;
    }

    // Record webhook event for idempotency
    await db.query(
      `INSERT INTO webhook_events (recall_bot_id, event_type, event_id, payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (recall_bot_id, event_type, event_id) DO NOTHING`,
      [botId, event, eventId, JSON.stringify(payload)]
    );

    logger.info({ event, botId }, 'Processing webhook');

    // Handle different event types
    switch (event) {
      case 'bot.status_change':
        await handleStatusChange(payload);
        break;
      
      case 'bot.recording_permission_denied':
        await handleConsentDenied(payload);
        break;

      case 'bot.leave_call':
        await handleLeaveCall(payload);
        break;

      case 'bot.transcription.chat_message':
        await handleChatMessage(payload);
        break;

      case 'bot.done':
      case 'bot.call_ended':
        await handleCallEnded(payload);
        break;

      default:
        logger.debug({ event }, 'Unhandled webhook event type');
    }

    // Mark as processed
    await db.query(
      `UPDATE webhook_events SET processed_at = NOW() 
       WHERE recall_bot_id = $1 AND event_type = $2 AND event_id = $3`,
      [botId, event, eventId]
    );

  } catch (err) {
    logger.error({ err, event, botId }, 'Error processing webhook');
  }
});

async function handleStatusChange(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const statusChanges = bot?.status_changes as Array<{ code: string }>;
  const metadata = bot?.metadata as Record<string, string>;

  if (!statusChanges?.length) return;

  const latestStatus = statusChanges[statusChanges.length - 1].code;
  const dbStatus = RECALL_EVENT_TO_STATUS[latestStatus] || latestStatus;
  const meetingId = metadata?.internal_meeting_id;

  if (meetingId) {
    await db.query(
      `UPDATE meetings 
       SET status = $1, recall_bot_id = $2, updated_at = NOW() 
       WHERE id = $3`,
      [dbStatus, botId, meetingId]
    );
    logger.info({ meetingId, status: dbStatus }, 'Meeting status updated');
  }
}

async function handleConsentDenied(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const metadata = bot?.metadata as Record<string, string>;
  const meetingId = metadata?.internal_meeting_id;
  const tenantId = metadata?.tenant_id;

  if (!meetingId || !tenantId) {
    logger.warn({ botId }, 'Missing meeting or tenant ID in consent denied event');
    return;
  }

  // Use the consent handler for full denial processing
  const recallClient = {
    leaveMeeting: (id: string) => recallService.leaveMeeting(id),
    deleteRecording: (id: string) => recallService.deleteRecording(id),
    deleteTranscript: (id: string) => recallService.deleteTranscript(id),
  };

  await processConsentDenial(db, recallClient, {
    meetingId,
    tenantId,
    recallBotId: botId,
    eventType: 'recording_permission_denied',
    eventSource: 'recall_webhook',
  });

  // Also update meeting status
  await db.query(
    `UPDATE meetings 
     SET status = 'consent_denied', updated_at = NOW() 
     WHERE id = $1`,
    [meetingId]
  );

  logger.info({ meetingId, botId }, 'Consent denial processed');
}

async function handleLeaveCall(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const metadata = bot?.metadata as Record<string, string>;
  const meetingId = metadata?.internal_meeting_id;
  const tenantId = metadata?.tenant_id;
  const subCode = data?.sub_code as string;

  // Check if this is a host removal
  if (subCode === 'host_removed' && meetingId && tenantId) {
    logger.info({ meetingId, botId, subCode }, 'Bot removed by host');

    const recallClient = {
      leaveMeeting: (id: string) => recallService.leaveMeeting(id),
      deleteRecording: (id: string) => recallService.deleteRecording(id),
      deleteTranscript: (id: string) => recallService.deleteTranscript(id),
    };

    await processConsentDenial(db, recallClient, {
      meetingId,
      tenantId,
      recallBotId: botId,
      eventType: 'bot_removed_by_host',
      eventSource: 'recall_webhook',
    });

    await db.query(
      `UPDATE meetings 
       SET status = 'consent_denied', updated_at = NOW() 
       WHERE id = $1`,
      [meetingId]
    );
  }
}

async function handleChatMessage(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const metadata = bot?.metadata as Record<string, string>;
  const meetingId = metadata?.internal_meeting_id;
  const tenantId = metadata?.tenant_id;

  const chatData = data?.chat_message as Record<string, unknown>;
  const message = chatData?.text as string;
  const senderName = chatData?.sender_name as string;

  if (!message || !meetingId || !tenantId) {
    return;
  }

  // Get tenant's stop keywords
  const settings = await getConsentSettings(db, tenantId);
  const stopKeywords = getStopKeywords(settings);

  // Check if message contains a stop keyword
  if (containsStopKeyword(message, stopKeywords)) {
    logger.info({ meetingId, senderName }, 'Stop keyword detected in chat');

    const recallClient = {
      leaveMeeting: (id: string) => recallService.leaveMeeting(id),
      deleteRecording: (id: string) => recallService.deleteRecording(id),
      deleteTranscript: (id: string) => recallService.deleteTranscript(id),
    };

    await processConsentDenial(db, recallClient, {
      meetingId,
      tenantId,
      recallBotId: botId,
      eventType: 'consent_denied_by_keyword',
      eventSource: 'chat_message',
      actorName: senderName,
    });

    await db.query(
      `UPDATE meetings 
       SET status = 'consent_denied', updated_at = NOW() 
       WHERE id = $1`,
      [meetingId]
    );
  }
}

async function handleCallEnded(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const bot = data?.bot as Record<string, unknown>;
  const botId = bot?.id as string;
  const metadata = bot?.metadata as Record<string, string>;
  const meetingId = metadata?.internal_meeting_id;

  if (!meetingId) {
    const result = await db.query<{ id: string }>(
      'SELECT id FROM meetings WHERE recall_bot_id = $1',
      [botId]
    );
    if (result.rows.length === 0) {
      logger.warn({ botId }, 'No meeting found for bot');
      return;
    }
  }

  await db.query(
    `UPDATE meetings 
     SET status = 'processing', updated_at = NOW() 
     WHERE id = $1 OR recall_bot_id = $2`,
    [meetingId, botId]
  );

  logger.info({ meetingId, botId }, 'Call ended, ready for processing');
}
