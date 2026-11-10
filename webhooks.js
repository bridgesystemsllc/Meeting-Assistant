/**
 * Recall.ai Webhook Handler
 * Receives events from Recall.ai when bot status changes or recording is ready
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../utils/db');
const logger = require('../utils/logger');
const recallService = require('../services/recallService');
const { queueMeetingProcessing } = require('../jobs/worker');

/**
 * Verify webhook signature from Recall.ai
 */
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-recall-signature'];
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  
  if (!secret) {
    logger.warn('RECALL_WEBHOOK_SECRET not set - skipping signature verification');
    return next();
  }
  
  if (!signature) {
    logger.warn('Missing webhook signature');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    logger.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

/**
 * POST /webhooks/recall
 * Main webhook endpoint for all Recall.ai events
 */
router.post('/recall', verifyWebhookSignature, async (req, res) => {
  // Always respond 200 immediately to prevent retries
  res.status(200).json({ received: true });

  const payload = req.body;
  logger.info('Recall.ai webhook received', { event: payload.event });

  try {
    const { eventType, botId, status, recordingUrl, metadata } = recallService.parseWebhookEvent(payload);
    const internalMeetingId = metadata?.internal_meeting_id;

    if (!botId) {
      logger.warn('Webhook received without bot ID', { payload });
      return;
    }

    switch (eventType) {
      case 'bot.status_change':
        await handleBotStatusChange({ botId, status, internalMeetingId });
        break;

      case 'bot.recording_ready':
        await handleRecordingReady({ botId, recordingUrl, internalMeetingId });
        break;

      default:
        logger.debug('Unhandled webhook event type', { eventType });
    }

  } catch (err) {
    logger.error('Error processing Recall webhook', { error: err.message, payload });
  }
});

/**
 * Handles bot status changes (joining, in-call, done, failed)
 */
async function handleBotStatusChange({ botId, status, internalMeetingId }) {
  const STATUS_MAP = {
    'joining_call': 'bot_joining',
    'in_call_not_recording': 'bot_joining',
    'in_call_recording': 'recording',
    'call_ended': 'processing',
    'done': 'processing',
    'fatal': 'failed'
  };

  const dbStatus = STATUS_MAP[status] || status;

  if (internalMeetingId) {
    await db.query(
      'UPDATE meetings SET status = $1, recall_bot_id = $2, updated_at = NOW() WHERE id = $3',
      [dbStatus, botId, internalMeetingId]
    );
    logger.info('Meeting status updated', { meetingId: internalMeetingId, status: dbStatus, recallStatus: status });
  }

  // If call ended, try to get recording URL
  if (status === 'done' || status === 'call_ended') {
    logger.info('Call ended, fetching recording URL...', { botId });
    
    // Give Recall a moment to process
    setTimeout(async () => {
      try {
        const recordingUrl = await recallService.getRecordingUrl(botId);
        if (recordingUrl && internalMeetingId) {
          await handleRecordingReady({ botId, recordingUrl, internalMeetingId });
        }
      } catch (err) {
        logger.error('Failed to fetch recording after call end', { botId, error: err.message });
      }
    }, 10000); // 10 second delay
  }
}

/**
 * Handles when recording is ready - triggers the processing pipeline
 */
async function handleRecordingReady({ botId, recordingUrl, internalMeetingId }) {
  if (!recordingUrl) {
    logger.error('Recording ready event but no URL provided', { botId });
    return;
  }

  // Find meeting by bot ID if we don't have the internal ID
  let meetingId = internalMeetingId;
  if (!meetingId) {
    const result = await db.query(
      'SELECT id FROM meetings WHERE recall_bot_id = $1',
      [botId]
    );
    if (result.rows.length > 0) {
      meetingId = result.rows[0].id;
    }
  }

  if (!meetingId) {
    logger.error('Could not find meeting for bot', { botId });
    return;
  }

  // Store recording URL
  await db.query(
    'UPDATE meetings SET recording_url = $1, status = $2, updated_at = NOW() WHERE id = $3',
    [recordingUrl, 'processing', meetingId]
  );

  // Queue the processing job
  await queueMeetingProcessing(meetingId, recordingUrl);
  logger.info('Recording ready, processing queued', { meetingId, botId });
}

module.exports = router;
