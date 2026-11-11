/**
 * Consent Service
 * Handles consent flow: bot naming, notices, denial detection, and cleanup
 */

import { logger } from '../lib/logger.js';

const DEFAULT_BOT_NAME = 'Meeting Notetaker (recording transcript)';
const DEFAULT_PRE_JOIN_NOTICE = 'This meeting will be recorded and transcribed by an AI notetaker. If you do not consent, please ask the host to remove the bot or type "stop recording" in the chat.';
const DEFAULT_IN_CALL_NOTICE = 'Recording in progress. Type "stop recording" to end.';
const DEFAULT_STOP_KEYWORDS = ['stop recording', 'stop transcription', 'leave meeting'];

export interface ConsentSettings {
  botDisplayName: string | null;
  preJoinNotice: string | null;
  inCallNotice: string | null;
  stopKeywords: string[];
}

export interface ConsentEvent {
  id?: string;
  tenantId: string;
  meetingId: string;
  eventType: ConsentEventType;
  eventSource?: string;
  actorName?: string;
  createdAt?: Date;
}

export type ConsentEventType =
  | 'consent_granted'
  | 'consent_denied_by_host'
  | 'consent_denied_by_keyword'
  | 'bot_removed_by_host'
  | 'recording_permission_denied';

export type ConsentStatus = 'pending' | 'granted' | 'denied';

/**
 * Get the effective bot display name for a tenant
 * Uses tenant config if set, otherwise returns default
 */
export function getBotDisplayName(settings: ConsentSettings | null): string {
  return settings?.botDisplayName || DEFAULT_BOT_NAME;
}

/**
 * Get the pre-join notice text for a tenant
 */
export function getPreJoinNotice(settings: ConsentSettings | null): string {
  return settings?.preJoinNotice || DEFAULT_PRE_JOIN_NOTICE;
}

/**
 * Get the in-call notice text for a tenant
 */
export function getInCallNotice(settings: ConsentSettings | null): string {
  return settings?.inCallNotice || DEFAULT_IN_CALL_NOTICE;
}

/**
 * Get the stop keywords for a tenant
 */
export function getStopKeywords(settings: ConsentSettings | null): string[] {
  return settings?.stopKeywords?.length ? settings.stopKeywords : DEFAULT_STOP_KEYWORDS;
}

/**
 * Check if a message contains a stop keyword (case-insensitive)
 */
export function containsStopKeyword(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase().trim();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * Validate that bot name includes disclosure keywords
 * Bot name must indicate it's recording/transcribing
 */
export function validateBotName(name: string): { valid: boolean; error?: string } {
  const disclosureKeywords = ['notetaker', 'recorder', 'recording', 'transcrip', 'ai notes'];
  const lowerName = name.toLowerCase();
  
  const hasDisclosure = disclosureKeywords.some(keyword => lowerName.includes(keyword));
  
  if (!hasDisclosure) {
    return {
      valid: false,
      error: 'Bot name must include a disclosure keyword (e.g., "Notetaker", "Recorder", "Recording", "Transcript", or "AI Notes")',
    };
  }
  
  return { valid: true };
}

/**
 * Map Recall event types to consent event types
 */
export function mapRecallEventToConsentEvent(
  recallEventType: string,
  recallSubCode?: string
): ConsentEventType | null {
  switch (recallEventType) {
    case 'recording_permission_denied':
      return 'recording_permission_denied';
    case 'bot.leave_call':
      if (recallSubCode === 'host_removed') {
        return 'bot_removed_by_host';
      }
      return null;
    case 'bot.status_change':
      if (recallSubCode === 'recording_permission_denied') {
        return 'recording_permission_denied';
      }
      return null;
    default:
      return null;
  }
}

/**
 * Determine if an event represents a consent denial
 */
export function isConsentDenialEvent(eventType: ConsentEventType): boolean {
  return [
    'consent_denied_by_host',
    'consent_denied_by_keyword',
    'bot_removed_by_host',
    'recording_permission_denied',
  ].includes(eventType);
}

/**
 * Get human-readable reason for consent denial
 */
export function getDenialReason(eventType: ConsentEventType): string {
  switch (eventType) {
    case 'consent_denied_by_host':
      return 'Host denied recording permission';
    case 'consent_denied_by_keyword':
      return 'Participant requested recording to stop';
    case 'bot_removed_by_host':
      return 'Bot was removed by the host';
    case 'recording_permission_denied':
      return 'Recording permission was denied';
    default:
      return 'Consent was denied';
  }
}

// ============================================================
// Data Access Functions (to be replaced by RLS helpers later)
// ============================================================

import pg from 'pg';

export interface DbClient {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
}

/**
 * Get consent settings for a tenant
 * Data access function - will be replaced by RLS helpers
 */
export async function getConsentSettings(
  db: DbClient,
  tenantId: string
): Promise<ConsentSettings | null> {
  const result = await db.query<{
    bot_display_name: string | null;
    pre_join_notice: string | null;
    in_call_notice: string | null;
    stop_keywords: string[] | null;
  }>(
    `SELECT bot_display_name, pre_join_notice, in_call_notice, stop_keywords
     FROM tenant_settings
     WHERE tenant_id = $1`,
    [tenantId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    botDisplayName: row.bot_display_name,
    preJoinNotice: row.pre_join_notice,
    inCallNotice: row.in_call_notice,
    stopKeywords: row.stop_keywords || DEFAULT_STOP_KEYWORDS,
  };
}

/**
 * Insert a consent event
 * Data access function - will be replaced by RLS helpers
 */
export async function insertConsentEvent(
  db: DbClient,
  event: Omit<ConsentEvent, 'id' | 'createdAt'>
): Promise<ConsentEvent> {
  const result = await db.query<{ id: string; created_at: Date }>(
    `INSERT INTO consent_events (tenant_id, meeting_id, event_type, event_source, actor_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [event.tenantId, event.meetingId, event.eventType, event.eventSource || null, event.actorName || null]
  );
  
  logger.info(
    { tenantId: event.tenantId, meetingId: event.meetingId, eventType: event.eventType },
    'Consent event recorded'
  );
  
  return {
    ...event,
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
  };
}

/**
 * Update meeting consent status
 * Data access function - will be replaced by RLS helpers
 */
export async function updateMeetingConsentStatus(
  db: DbClient,
  meetingId: string,
  status: ConsentStatus,
  deniedReason?: string
): Promise<void> {
  if (status === 'denied') {
    await db.query(
      `UPDATE meetings
       SET consent_status = $1, consent_denied_at = NOW(), consent_denied_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, deniedReason || null, meetingId]
    );
  } else {
    await db.query(
      `UPDATE meetings
       SET consent_status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, meetingId]
    );
  }
  
  logger.info({ meetingId, status, deniedReason }, 'Meeting consent status updated');
}

/**
 * Get meeting by ID with tenant context
 * Data access function - will be replaced by RLS helpers
 */
export async function getMeetingForConsent(
  db: DbClient,
  meetingId: string
): Promise<{ tenantId: string; recallBotId: string | null; consentStatus: ConsentStatus } | null> {
  const result = await db.query<{
    tenant_id: string;
    recall_bot_id: string | null;
    consent_status: ConsentStatus;
  }>(
    `SELECT tenant_id, recall_bot_id, consent_status
     FROM meetings
     WHERE id = $1`,
    [meetingId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return {
    tenantId: result.rows[0].tenant_id,
    recallBotId: result.rows[0].recall_bot_id,
    consentStatus: result.rows[0].consent_status,
  };
}

/**
 * Check if any data exists for a meeting (transcript, analysis, email)
 * Used to verify clean denial handling
 * Data access function - will be replaced by RLS helpers
 */
export async function meetingHasStoredData(
  db: DbClient,
  meetingId: string
): Promise<{ hasTranscript: boolean; hasAnalysis: boolean; hasEmail: boolean }> {
  const [transcriptResult, analysisResult, emailResult] = await Promise.all([
    db.query('SELECT 1 FROM transcripts WHERE meeting_id = $1 LIMIT 1', [meetingId]),
    db.query('SELECT 1 FROM meeting_analysis WHERE meeting_id = $1 LIMIT 1', [meetingId]),
    db.query('SELECT 1 FROM email_deliveries WHERE meeting_id = $1 LIMIT 1', [meetingId]),
  ]);
  
  return {
    hasTranscript: (transcriptResult.rowCount ?? 0) > 0,
    hasAnalysis: (analysisResult.rowCount ?? 0) > 0,
    hasEmail: (emailResult.rowCount ?? 0) > 0,
  };
}

/**
 * Delete all stored data for a meeting (on consent denial)
 * Data access function - will be replaced by RLS helpers
 */
export async function deleteStoredMeetingData(
  db: DbClient,
  meetingId: string
): Promise<{ deletedTranscripts: number; deletedAnalysis: number; deletedEmails: number }> {
  const [transcriptResult, analysisResult, emailResult] = await Promise.all([
    db.query('DELETE FROM transcripts WHERE meeting_id = $1', [meetingId]),
    db.query('DELETE FROM meeting_analysis WHERE meeting_id = $1', [meetingId]),
    db.query('DELETE FROM email_deliveries WHERE meeting_id = $1', [meetingId]),
  ]);
  
  const deleted = {
    deletedTranscripts: transcriptResult.rowCount ?? 0,
    deletedAnalysis: analysisResult.rowCount ?? 0,
    deletedEmails: emailResult.rowCount ?? 0,
  };
  
  logger.info({ meetingId, ...deleted }, 'Deleted stored meeting data due to consent denial');
  
  return deleted;
}
