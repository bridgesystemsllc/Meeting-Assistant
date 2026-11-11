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
  type DbClient,
} from './consent.js';

export interface RecallApiClient {
  leaveMeeting(botId: string): Promise<void>;
  deleteRecording(botId: string): Promise<void>;
  deleteTranscript(botId: string): Promise<void>;
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
    await deleteStoredMeetingData(db, meetingId);
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
    await updateMeetingConsentStatus(db, meetingId, 'denied', denialReason);
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
 * Check if a meeting should be processed based on consent status
 * Returns false if consent was denied (no processing should occur)
 */
export async function shouldProcessMeeting(
  db: DbClient,
  meetingId: string
): Promise<{ shouldProcess: boolean; reason?: string }> {
  const result = await db.query<{ consent_status: string }>(
    'SELECT consent_status FROM meetings WHERE id = $1',
    [meetingId]
  );
  
  if (result.rows.length === 0) {
    return { shouldProcess: false, reason: 'Meeting not found' };
  }
  
  const status = result.rows[0].consent_status;
  
  if (status === 'denied') {
    return { shouldProcess: false, reason: 'Consent was denied' };
  }
  
  return { shouldProcess: true };
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
