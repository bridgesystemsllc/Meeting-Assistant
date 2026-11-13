/**
 * Consent Denial Handler
 * Handles the full flow when consent is denied:
 * 1. Make bot leave the meeting
 * 2. Delete Recall media/transcript
 * 3. Delete any locally stored data
 * 4. Record the consent event
 */

import { logger } from '../lib/logger.js';
import {
  ConsentEventType,
  insertConsentEvent,
  updateMeetingConsentStatus,
  deleteStoredMeetingData,
  getDenialReason,
  getConsentSettings,
  getBotDisplayName,
  buildInCallAnnouncement,
  lookupTenantName,
  type DbClient,
} from './consent.js';

export interface RecallApiClient {
  leaveMeeting(botId: string): Promise<void>;
  deleteRecording(botId: string): Promise<void>;
  deleteTranscript(botId: string): Promise<void>;
  sendChatMessage?(botId: string, message: string): Promise<boolean>;
}

export interface ConsentDenialResult {
  success: boolean;
  meetingId: string;
  tenantId: string;
  eventType: ConsentEventType;
  recallCleanupSuccess: boolean;
  localCleanupSuccess: boolean;
  error?: string;
}

/**
 * Handle a consent denial event
 * This is the main entry point when consent is denied
 */
export async function handleConsentDenial(
  db: DbClient,
  recallClient: RecallApiClient,
  params: {
    meetingId: string;
    tenantId: string;
    recallBotId: string | null;
    eventType: ConsentEventType;
    eventSource?: string;
    actorName?: string;
  }
): Promise<ConsentDenialResult> {
  const { meetingId, tenantId, recallBotId, eventType, eventSource, actorName } = params;
  
  logger.info(
    { meetingId, tenantId, recallBotId, eventType },
    'Processing consent denial'
  );
  
  let recallCleanupSuccess = true;
  let localCleanupSuccess = true;
  
  // Step 1: Make bot leave and delete Recall data
  if (recallBotId) {
    try {
      await cleanupRecallData(recallClient, recallBotId);
    } catch (err) {
      recallCleanupSuccess = false;
      logger.error(
        { err, meetingId, recallBotId },
        'Failed to cleanup Recall data on consent denial'
      );
    }
  }
  
  // Step 2: Delete any locally stored data (transcript, analysis, email)
  try {
    await deleteStoredMeetingData(db, tenantId, meetingId);
  } catch (err) {
    localCleanupSuccess = false;
    logger.error(
      { err, meetingId },
      'Failed to delete local data on consent denial'
    );
  }
  
  // Step 3: Update meeting status to denied
  try {
    const denialReason = getDenialReason(eventType);
    await updateMeetingConsentStatus(db, tenantId, meetingId, 'denied', denialReason);
  } catch (err) {
    logger.error(
      { err, meetingId },
      'Failed to update meeting consent status'
    );
  }
  
  // Step 4: Record the consent event (always, even if cleanup failed)
  try {
    await insertConsentEvent(db, {
      tenantId,
      meetingId,
      eventType,
      eventSource,
      actorName,
    });
  } catch (err) {
    logger.error(
      { err, meetingId, eventType },
      'Failed to record consent event'
    );
  }
  
  return {
    success: recallCleanupSuccess && localCleanupSuccess,
    meetingId,
    tenantId,
    eventType,
    recallCleanupSuccess,
    localCleanupSuccess,
  };
}

/**
 * Clean up Recall data (leave meeting, delete recording and transcript)
 */
async function cleanupRecallData(
  recallClient: RecallApiClient,
  botId: string
): Promise<void> {
  logger.info({ botId }, 'Cleaning up Recall data');
  
  // Try to leave the meeting first (may already be out)
  try {
    await recallClient.leaveMeeting(botId);
  } catch (err) {
    // Ignore errors if bot already left
    logger.debug({ err, botId }, 'Leave meeting failed (may already be out)');
  }
  
  // Delete recording
  try {
    await recallClient.deleteRecording(botId);
  } catch (err) {
    logger.warn({ err, botId }, 'Delete recording failed');
    throw err;
  }
  
  // Delete transcript
  try {
    await recallClient.deleteTranscript(botId);
  } catch (err) {
    logger.warn({ err, botId }, 'Delete transcript failed');
    throw err;
  }
  
  logger.info({ botId }, 'Recall data cleanup completed');
}

/**
 * Handle a chat message that might contain a stop keyword
 * Called from webhook handler when chat messages are received
 */
export async function handleChatMessage(
  db: DbClient,
  recallClient: RecallApiClient,
  params: {
    meetingId: string;
    tenantId: string;
    recallBotId: string | null;
    message: string;
    senderName?: string;
    stopKeywords: string[];
  }
): Promise<{ triggered: boolean; result?: ConsentDenialResult }> {
  const { meetingId, tenantId, recallBotId, message, senderName, stopKeywords } = params;
  
  // Check if message contains a stop keyword
  const lowerMessage = message.toLowerCase().trim();
  const triggeredKeyword = stopKeywords.find(keyword =>
    lowerMessage.includes(keyword.toLowerCase())
  );
  
  if (!triggeredKeyword) {
    return { triggered: false };
  }
  
  logger.info(
    { meetingId, triggeredKeyword, senderName },
    'Stop keyword detected in chat'
  );
  
  const result = await handleConsentDenial(db, recallClient, {
    meetingId,
    tenantId,
    recallBotId,
    eventType: 'consent_denied_by_keyword',
    eventSource: 'chat_message',
    actorName: senderName,
  });
  
  return { triggered: true, result };
}

/**
 * Auto-post the in-call consent announcement when the bot enters
 * in_call_recording. Uses Recall sendChatMessage.
 */
export async function announceInCallRecording(
  db: DbClient,
  recallClient: Pick<RecallApiClient, 'sendChatMessage'>,
  params: {
    meetingId: string;
    tenantId: string;
    recallBotId: string;
    botName?: string;
    tenantName?: string;
  }
): Promise<{ posted: boolean; message: string | null }> {
  const { meetingId, tenantId, recallBotId } = params;
  if (!recallClient.sendChatMessage) {
    logger.warn({ meetingId }, 'Recall client cannot send chat messages');
    return { posted: false, message: null };
  }

  const settings = await getConsentSettings(db, tenantId);
  const tenantName =
    params.tenantName?.trim() ||
    (await lookupTenantName(db, tenantId)) ||
    'the host';
  const botName = params.botName?.trim() || getBotDisplayName(settings);
  const message = buildInCallAnnouncement(settings, { botName, tenantName });

  try {
    const posted = await recallClient.sendChatMessage(recallBotId, message);
    if (posted) {
      logger.info({ meetingId, tenantId, recallBotId }, 'In-call consent announcement posted');
    } else {
      logger.warn({ meetingId, tenantId, recallBotId }, 'In-call consent announcement failed');
    }
    return { posted, message };
  } catch (err) {
    logger.warn({ err, meetingId, tenantId, recallBotId }, 'In-call consent announcement failed');
    return { posted: false, message };
  }
}
