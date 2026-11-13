/**
 * Consent Service
 * Handles consent flow: bot naming, notices, denial detection, and cleanup
 */

import { logger } from '../lib/logger.js';
import { getEmailAdapter } from '../lib/email.js';

const DEFAULT_BOT_NAME = 'Meeting Notetaker (recording transcript)';
const DEFAULT_PRE_JOIN_NOTICE =
  'This meeting will be recorded and transcribed by an AI notetaker. If you do not consent, please ask the host to remove the bot or type "stop recording" in the chat.';
const DEFAULT_IN_CALL_NOTICE =
  "{bot_name} is recording and transcribing for {tenant}. Type 'stop' or ask the host to remove me.";
const DEFAULT_STOP_KEYWORDS = ['stop recording', 'stop transcription', 'leave meeting'];
const DISCLOSURE_TERMS = ['notetaker', 'recorder', 'ai notes'] as const;
export const BOT_NAME_NOT_DISCLOSING = 'BOT_NAME_NOT_DISCLOSING';
export const DEFAULT_CONSENT_POLICY = 'all_party_notice';

export interface ConsentSettings {
  botDisplayName: string | null;
  preJoinNotice: string | null;
  inCallNotice: string | null;
  stopKeywords: string[];
  storeAudio?: boolean;
  consentPolicy?: string;
  notifyAttendees?: boolean;
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

export interface BotNameValidation {
  valid: boolean;
  code?: typeof BOT_NAME_NOT_DISCLOSING;
  error?: string;
}

/**
 * Get the effective bot display name for a tenant.
 * Tenant setting first, then env BOT_NAME as the fallback default only.
 */
export function getBotDisplayName(
  settings: ConsentSettings | null,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromSettings = settings?.botDisplayName?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = env.BOT_NAME?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_BOT_NAME;
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

export function getConsentPolicy(settings: ConsentSettings | null): string {
  return settings?.consentPolicy || DEFAULT_CONSENT_POLICY;
}

export function getNotifyAttendees(settings: ConsentSettings | null): boolean {
  return settings?.notifyAttendees ?? true;
}

export function getStoreAudio(settings: ConsentSettings | null): boolean {
  return settings?.storeAudio ?? false;
}

/**
 * Check if a message contains a stop keyword (case-insensitive)
 */
export function containsStopKeyword(message: string, keywords: string[]): boolean {
  const lowerMessage = message.toLowerCase().trim();
  return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

function normalizeDisclosureName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validate that the bot name discloses recording per SPEC-MA-PROD-V1 §5.4:
 * it must contain "Notetaker", "Recorder", or "AI notes".
 */
export function validateBotName(name: string): BotNameValidation {
  const lowerName = normalizeDisclosureName(name);
  const hasDisclosure = DISCLOSURE_TERMS.some((term) => lowerName.includes(term));

  if (!hasDisclosure) {
    return {
      valid: false,
      code: BOT_NAME_NOT_DISCLOSING,
      error:
        'Bot name must contain "Notetaker", "Recorder", or "AI notes" so attendees can tell that recording is disclosed.',
    };
  }

  return { valid: true };
}

export function interpolateNotice(
  template: string,
  vars: { botName: string; tenantName: string; privacyUrl?: string }
): string {
  return template
    .replaceAll('{bot_name}', vars.botName)
    .replaceAll('{Bot name}', vars.botName)
    .replaceAll('{tenant}', vars.tenantName)
    .replaceAll('{Tenant}', vars.tenantName)
    .replaceAll('{privacy_url}', vars.privacyUrl ?? '')
    .replaceAll('{Privacy url}', vars.privacyUrl ?? '');
}

/**
 * In-call announcement. Custom text is allowed but must keep the
 * disclosure sentence from §5.4.
 */
export function buildInCallAnnouncement(
  settings: ConsentSettings | null,
  vars: { botName: string; tenantName: string }
): string {
  const disclosure = `${vars.botName} is recording and transcribing for ${vars.tenantName}.`;
  const custom = settings?.inCallNotice?.trim();
  if (!custom) {
    return `${disclosure} Type 'stop' or ask the host to remove me.`;
  }
  const interpolated = interpolateNotice(custom, vars);
  if (/is recording and transcribing for/i.test(interpolated)) {
    return interpolated;
  }
  return `${disclosure} ${interpolated}`;
}

/**
 * Pre-join notice: names the tenant, states that an AI notetaker will
 * record and transcribe the meeting, links the privacy notice, and
 * explains how to object.
 */
export function buildPreJoinNotice(
  settings: ConsentSettings | null,
  vars: { tenantName: string; privacyUrl: string }
): string {
  const required = 'an AI notetaker will record and transcribe this meeting';
  const base = interpolateNotice(getPreJoinNotice(settings), {
    botName: '',
    tenantName: vars.tenantName,
    privacyUrl: vars.privacyUrl,
  });
  const parts: string[] = [];
  if (!base.toLowerCase().includes(vars.tenantName.toLowerCase()) && vars.tenantName) {
    parts.push(vars.tenantName);
  }
  parts.push(base);
  if (!/record and transcribe|recorded and transcribed/i.test(base)) {
    parts.push(`This meeting: ${required}.`);
  }
  if (vars.privacyUrl && !base.includes(vars.privacyUrl)) {
    parts.push(`Privacy notice: ${vars.privacyUrl}`);
  }
  if (!/object|do not consent|remove/i.test(base)) {
    parts.push('If you do not consent, ask the host to remove the notetaker or type "stop" in the chat.');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function privacyNoticeUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.FRONTEND_URL || env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/privacy` : '/privacy';
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
    store_audio: boolean | null;
    consent_policy: string | null;
    notify_attendees: boolean | null;
  }>(
    `SELECT bot_display_name, pre_join_notice, in_call_notice, stop_keywords,
            store_audio, consent_policy, notify_attendees
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
    storeAudio: row.store_audio === true ? true : false,
    consentPolicy: row.consent_policy || DEFAULT_CONSENT_POLICY,
    notifyAttendees: row.notify_attendees !== false,
  };
}

export async function lookupTenantName(db: DbClient, tenantId: string): Promise<string | null> {
  const result = await db.query<{ lookup_tenant_name: string | null }>(
    'SELECT lookup_tenant_name($1) AS lookup_tenant_name',
    [tenantId]
  );
  return result.rows[0]?.lookup_tenant_name ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNoticeEmails(emails: unknown, hostEmail?: string | null): string[] {
  const collected: string[] = [];
  if (Array.isArray(emails)) {
    for (const value of emails) {
      if (typeof value === 'string' && EMAIL_RE.test(value.trim())) {
        collected.push(value.trim().toLowerCase());
      }
    }
  }
  if (collected.length === 0 && hostEmail && EMAIL_RE.test(hostEmail.trim())) {
    collected.push(hostEmail.trim().toLowerCase());
  }
  return [...new Set(collected)];
}

export interface PreJoinNoticeResult {
  sent: boolean;
  queued: boolean;
  recipients: string[];
  notice: string;
}

/**
 * Queue (and attempt to send) the pre-join consent notice. When no attendee
 * emails are provided, the host is the recipient of a copyable notice.
 * Email delivery failure does not throw: the notice is still queued and
 * returned so the host can copy it.
 */
export async function queuePreJoinNotices(
  db: DbClient,
  params: {
    tenantId: string;
    meetingId: string;
    tenantName: string;
    hostEmail?: string | null;
    attendeeEmails?: unknown;
    settings: ConsentSettings | null;
  }
): Promise<PreJoinNoticeResult> {
  const notice = buildPreJoinNotice(params.settings, {
    tenantName: params.tenantName,
    privacyUrl: privacyNoticeUrl(),
  });
  if (!getNotifyAttendees(params.settings)) {
    return { sent: false, queued: false, recipients: [], notice };
  }

  const recipients = normalizeNoticeEmails(params.attendeeEmails, params.hostEmail);
  let sent = false;
  for (const recipient of recipients) {
    await db.query(
      `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, status)
       VALUES ($1, $2, $3, 'pending')`,
      [params.tenantId, params.meetingId, recipient]
    );
    try {
      await getEmailAdapter().send({
        to: recipient,
        subject: `Consent notice: an AI notetaker will record and transcribe this meeting`,
        text: notice,
      });
      await db.query(
        `UPDATE email_deliveries
         SET status = 'sent', sent_at = NOW()
         WHERE tenant_id = $1 AND meeting_id = $2 AND recipient_email = $3 AND status = 'pending'`,
        [params.tenantId, params.meetingId, recipient]
      );
      sent = true;
    } catch (err) {
      logger.warn({ err, meetingId: params.meetingId }, 'Pre-join consent notice could not be sent');
    }
  }

  return { sent, queued: recipients.length > 0, recipients, notice };
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
 * Update meeting consent status (tenant-scoped)
 */
export async function updateMeetingConsentStatus(
  db: DbClient,
  tenantId: string,
  meetingId: string,
  status: ConsentStatus,
  deniedReason?: string
): Promise<void> {
  if (status === 'denied') {
    await db.query(
      `UPDATE meetings
       SET consent_status = $1, consent_denied_at = NOW(), consent_denied_reason = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [status, deniedReason || null, meetingId, tenantId]
    );
  } else {
    await db.query(
      `UPDATE meetings
       SET consent_status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [status, meetingId, tenantId]
    );
  }

  logger.info({ meetingId, tenantId, status, deniedReason }, 'Meeting consent status updated');
}

/**
 * Get meeting by ID with tenant context (tenant-scoped)
 */
export async function getMeetingForConsent(
  db: DbClient,
  tenantId: string,
  meetingId: string
): Promise<{ tenantId: string; recallBotId: string | null; consentStatus: ConsentStatus } | null> {
  const result = await db.query<{
    tenant_id: string;
    recall_bot_id: string | null;
    consent_status: ConsentStatus;
  }>(
    `SELECT tenant_id, recall_bot_id, consent_status
     FROM meetings
     WHERE id = $1 AND tenant_id = $2`,
    [meetingId, tenantId]
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
 * Used to verify clean denial handling. Tenant-scoped.
 */
export async function meetingHasStoredData(
  db: DbClient,
  tenantId: string,
  meetingId: string
): Promise<{ hasTranscript: boolean; hasAnalysis: boolean; hasEmail: boolean }> {
  const [transcriptResult, analysisResult, emailResult] = await Promise.all([
    db.query('SELECT 1 FROM transcripts WHERE meeting_id = $1 AND tenant_id = $2 LIMIT 1', [
      meetingId,
      tenantId,
    ]),
    db.query('SELECT 1 FROM meeting_analysis WHERE meeting_id = $1 AND tenant_id = $2 LIMIT 1', [
      meetingId,
      tenantId,
    ]),
    db.query('SELECT 1 FROM email_deliveries WHERE meeting_id = $1 AND tenant_id = $2 LIMIT 1', [
      meetingId,
      tenantId,
    ]),
  ]);

  return {
    hasTranscript: (transcriptResult.rowCount ?? 0) > 0,
    hasAnalysis: (analysisResult.rowCount ?? 0) > 0,
    hasEmail: (emailResult.rowCount ?? 0) > 0,
  };
}

/**
 * Delete all stored data for a meeting (on consent denial). Tenant-scoped.
 */
export async function deleteStoredMeetingData(
  db: DbClient,
  tenantId: string,
  meetingId: string
): Promise<{ deletedTranscripts: number; deletedAnalysis: number; deletedEmails: number }> {
  const [transcriptResult, analysisResult, emailResult] = await Promise.all([
    db.query('DELETE FROM transcripts WHERE meeting_id = $1 AND tenant_id = $2', [meetingId, tenantId]),
    db.query('DELETE FROM meeting_analysis WHERE meeting_id = $1 AND tenant_id = $2', [
      meetingId,
      tenantId,
    ]),
    db.query('DELETE FROM email_deliveries WHERE meeting_id = $1 AND tenant_id = $2', [
      meetingId,
      tenantId,
    ]),
  ]);

  const deleted = {
    deletedTranscripts: transcriptResult.rowCount ?? 0,
    deletedAnalysis: analysisResult.rowCount ?? 0,
    deletedEmails: emailResult.rowCount ?? 0,
  };

  logger.info({ meetingId, tenantId, ...deleted }, 'Deleted stored meeting data due to consent denial');

  return deleted;
}
