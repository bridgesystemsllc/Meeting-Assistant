import { describe, it, expect } from 'vitest';
import {
  RECALL_EVENT_TO_STATUS,
  MEETING_STATUSES,
  detectPlatform,
  isAllowedMeetingUrl,
} from './recall.js';

describe('RECALL_EVENT_TO_STATUS', () => {
  it('maps all expected Recall events', () => {
    expect(RECALL_EVENT_TO_STATUS['joining_call']).toBe('bot_joining');
    expect(RECALL_EVENT_TO_STATUS['in_call_not_recording']).toBe('bot_joining');
    expect(RECALL_EVENT_TO_STATUS['in_call_recording']).toBe('recording');
    expect(RECALL_EVENT_TO_STATUS['call_ended']).toBe('processing');
    expect(RECALL_EVENT_TO_STATUS['done']).toBe('processing');
    expect(RECALL_EVENT_TO_STATUS['fatal']).toBe('failed');
    expect(RECALL_EVENT_TO_STATUS['recording_permission_denied']).toBe('consent_denied');
  });

  it('maps to valid meeting statuses', () => {
    const mappedStatuses = Object.values(RECALL_EVENT_TO_STATUS);
    for (const status of mappedStatuses) {
      expect(MEETING_STATUSES).toContain(status);
    }
  });
});

describe('detectPlatform', () => {
  it('detects Zoom URLs', () => {
    expect(detectPlatform('https://zoom.us/j/123456789')).toBe('zoom');
    expect(detectPlatform('https://us02web.zoom.us/j/123456789')).toBe('zoom');
  });

  it('detects Google Meet URLs', () => {
    expect(detectPlatform('https://meet.google.com/abc-defg-hij')).toBe('google_meet');
  });

  it('detects Teams URLs', () => {
    expect(detectPlatform('https://teams.microsoft.com/l/meetup-join/123')).toBe('teams');
  });

  it('detects Webex URLs', () => {
    expect(detectPlatform('https://example.webex.com/meet/user')).toBe('webex');
  });

  it('returns null for unknown platforms', () => {
    expect(detectPlatform('https://unknown.com/meeting')).toBeNull();
    expect(detectPlatform('not-a-url')).toBeNull();
  });
});

describe('isAllowedMeetingUrl', () => {
  it('allows valid Zoom URLs', () => {
    expect(isAllowedMeetingUrl('https://zoom.us/j/123456789')).toBe(true);
    expect(isAllowedMeetingUrl('https://us02web.zoom.us/j/123')).toBe(true);
  });

  it('allows valid Google Meet URLs', () => {
    expect(isAllowedMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
  });

  it('allows valid Teams URLs', () => {
    expect(isAllowedMeetingUrl('https://teams.microsoft.com/l/meetup')).toBe(true);
    expect(isAllowedMeetingUrl('https://teams.live.com/l/meetup')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedMeetingUrl('https://evil.com/meeting')).toBe(false);
    expect(isAllowedMeetingUrl('https://fake-zoom.us/j/123')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedMeetingUrl('not-a-url')).toBe(false);
    expect(isAllowedMeetingUrl('')).toBe(false);
  });
});
