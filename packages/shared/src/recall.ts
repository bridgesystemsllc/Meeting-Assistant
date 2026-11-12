/**
 * Recall.ai event types and status mapping
 * Docs: https://docs.recall.ai
 */

/**
 * Maps Recall.ai bot status codes to internal meeting statuses
 */
export const RECALL_EVENT_TO_STATUS: Record<string, string> = {
  // Bot lifecycle
  'joining_call': 'bot_joining',
  'in_call_not_recording': 'bot_joining',
  'in_call_recording': 'recording',
  'call_ended': 'processing',
  'done': 'processing',
  'fatal': 'failed',
  
  // Permission events
  'recording_permission_denied': 'consent_denied',
  
  // Error states
  'analysis_failed': 'failed',
  'media_expired': 'failed',
};

/**
 * Meeting status values
 */
export const MEETING_STATUSES = [
  'scheduled',
  'bot_joining',
  'recording',
  'processing',
  'completed',
  'failed',
  'consent_denied',
] as const;

export type MeetingStatus = typeof MEETING_STATUSES[number];

/**
 * Statuses a process-meeting job may claim. Terminal states
 * (consent_denied, completed, media_pending, dlq) are excluded.
 * 'joining' and 'in_call' appear in product writes but not MEETING_STATUSES.
 */
export const CLAIMABLE_MEETING_STATUSES = [
  'scheduled',
  'bot_joining',
  'joining',
  'recording',
  'in_call',
  'processing',
  'failed',
] as const;

export type ClaimableMeetingStatus = (typeof CLAIMABLE_MEETING_STATUSES)[number];

export function isMeetingClaimableForProcessing(
  status: string,
  consentStatus?: string | null
): boolean {
  return (
    (CLAIMABLE_MEETING_STATUSES as readonly string[]).includes(status) &&
    consentStatus !== 'denied'
  );
}

/**
 * Supported meeting platforms
 */
export const MEETING_PLATFORMS = ['zoom', 'google_meet', 'teams', 'webex'] as const;

export type MeetingPlatform = typeof MEETING_PLATFORMS[number];

/**
 * Detects meeting platform from URL
 */
export function detectPlatform(url: string): MeetingPlatform | null {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('meet.google.com')) return 'google_meet';
  if (url.includes('teams.microsoft.com')) return 'teams';
  if (url.includes('webex.com')) return 'webex';
  return null;
}

/**
 * Allowed meeting URL hosts
 */
export const ALLOWED_MEETING_HOSTS = [
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com',
  'webex.com',
] as const;

/**
 * Validates that a meeting URL is from an allowed platform
 */
export function isAllowedMeetingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_MEETING_HOSTS.some(host => 
      parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
  } catch {
    return false;
  }
}
