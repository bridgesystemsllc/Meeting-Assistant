/**
 * Consent Service Unit Tests
 */
import { describe, it, expect } from 'vitest';
import {
  getBotDisplayName,
  getPreJoinNotice,
  getInCallNotice,
  getStopKeywords,
  containsStopKeyword,
  validateBotName,
  mapRecallEventToConsentEvent,
  isConsentDenialEvent,
  getDenialReason,
  buildInCallAnnouncement,
  buildPreJoinNotice,
  BOT_NAME_NOT_DISCLOSING,
  type ConsentSettings,
} from './consent.js';

describe('Consent Service', () => {
  describe('getBotDisplayName', () => {
    it('returns custom name when settings provided', () => {
      const settings: ConsentSettings = {
        botDisplayName: 'Custom Notetaker Bot',
        preJoinNotice: null,
        inCallNotice: null,
        stopKeywords: [],
      };
      expect(getBotDisplayName(settings)).toBe('Custom Notetaker Bot');
    });

    it('returns default name when settings null', () => {
      expect(getBotDisplayName(null)).toBe('Meeting Notetaker (recording transcript)');
    });

    it('returns default name when botDisplayName null', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: null,
        inCallNotice: null,
        stopKeywords: [],
      };
      expect(getBotDisplayName(settings)).toBe('Meeting Notetaker (recording transcript)');
    });
  });

  describe('getPreJoinNotice', () => {
    it('returns custom notice when provided', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: 'Custom pre-join notice',
        inCallNotice: null,
        stopKeywords: [],
      };
      expect(getPreJoinNotice(settings)).toBe('Custom pre-join notice');
    });

    it('returns default notice when null', () => {
      const notice = getPreJoinNotice(null);
      expect(notice).toContain('recorded and transcribed');
      expect(notice).toContain('stop recording');
    });
  });

  describe('getInCallNotice', () => {
    it('returns custom notice when provided', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: null,
        inCallNotice: 'Custom in-call notice',
        stopKeywords: [],
      };
      expect(getInCallNotice(settings)).toBe('Custom in-call notice');
    });

    it('returns default notice when null', () => {
      const notice = getInCallNotice(null);
      expect(notice).toContain('is recording and transcribing for');
      expect(notice).toContain("Type 'stop'");
    });
  });

  describe('getStopKeywords', () => {
    it('returns custom keywords when provided', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: null,
        inCallNotice: null,
        stopKeywords: ['halt', 'end recording'],
      };
      expect(getStopKeywords(settings)).toEqual(['halt', 'end recording']);
    });

    it('returns default keywords when empty array', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: null,
        inCallNotice: null,
        stopKeywords: [],
      };
      const keywords = getStopKeywords(settings);
      expect(keywords).toContain('stop recording');
      expect(keywords).toContain('stop transcription');
      expect(keywords).toContain('leave meeting');
    });

    it('returns default keywords when null', () => {
      const keywords = getStopKeywords(null);
      expect(keywords).toContain('stop recording');
    });
  });

  describe('containsStopKeyword', () => {
    const keywords = ['stop recording', 'halt', 'end now'];

    it('detects exact match', () => {
      expect(containsStopKeyword('stop recording', keywords)).toBe(true);
    });

    it('detects case-insensitive match', () => {
      expect(containsStopKeyword('STOP RECORDING', keywords)).toBe(true);
      expect(containsStopKeyword('Stop Recording', keywords)).toBe(true);
    });

    it('detects keyword within message', () => {
      expect(containsStopKeyword('Please stop recording this meeting', keywords)).toBe(true);
    });

    it('returns false when no match', () => {
      expect(containsStopKeyword('Hello everyone', keywords)).toBe(false);
    });

    it('handles whitespace', () => {
      expect(containsStopKeyword('  stop recording  ', keywords)).toBe(true);
    });

    it('handles partial word matches', () => {
      expect(containsStopKeyword('halt the recording', keywords)).toBe(true);
      expect(containsStopKeyword('end now please', keywords)).toBe(true);
    });
  });

  describe('validateBotName', () => {
    it('accepts names with "notetaker"', () => {
      expect(validateBotName('Company Notetaker')).toEqual({ valid: true });
      expect(validateBotName('NOTETAKER Bot')).toEqual({ valid: true });
    });

    it('accepts names with "recorder"', () => {
      expect(validateBotName('Meeting Recorder')).toEqual({ valid: true });
    });

    it('rejects names that only contain "recording" without "Recorder"', () => {
      const result = validateBotName('Recording Bot');
      expect(result.valid).toBe(false);
      expect(result.code).toBe(BOT_NAME_NOT_DISCLOSING);
    });

    it('rejects names that only contain "transcript" without the §5.4 terms', () => {
      expect(validateBotName('Transcription Bot').valid).toBe(false);
      expect(validateBotName('Transcript Helper').code).toBe(BOT_NAME_NOT_DISCLOSING);
    });

    it('accepts names with "ai notes"', () => {
      expect(validateBotName('AI Notes Assistant')).toEqual({ valid: true });
    });

    it('rejects names without disclosure keywords', () => {
      const result = validateBotName('Company Bot');
      expect(result.valid).toBe(false);
      expect(result.code).toBe(BOT_NAME_NOT_DISCLOSING);
      expect(result.error).toMatch(/Notetaker|Recorder|AI notes/);
    });

    it('rejects generic names', () => {
      expect(validateBotName('Assistant').valid).toBe(false);
      expect(validateBotName('Helper Bot').valid).toBe(false);
    });
  });

  describe('mapRecallEventToConsentEvent', () => {
    it('maps recording_permission_denied', () => {
      expect(mapRecallEventToConsentEvent('recording_permission_denied'))
        .toBe('recording_permission_denied');
    });

    it('maps bot.leave_call with host_removed', () => {
      expect(mapRecallEventToConsentEvent('bot.leave_call', 'host_removed'))
        .toBe('bot_removed_by_host');
    });

    it('returns null for bot.leave_call without host_removed', () => {
      expect(mapRecallEventToConsentEvent('bot.leave_call', 'call_ended'))
        .toBeNull();
    });

    it('maps bot.status_change with recording_permission_denied', () => {
      expect(mapRecallEventToConsentEvent('bot.status_change', 'recording_permission_denied'))
        .toBe('recording_permission_denied');
    });

    it('returns null for unknown events', () => {
      expect(mapRecallEventToConsentEvent('bot.done')).toBeNull();
      expect(mapRecallEventToConsentEvent('unknown_event')).toBeNull();
    });
  });

  describe('isConsentDenialEvent', () => {
    it('returns true for denial events', () => {
      expect(isConsentDenialEvent('consent_denied_by_host')).toBe(true);
      expect(isConsentDenialEvent('consent_denied_by_keyword')).toBe(true);
      expect(isConsentDenialEvent('bot_removed_by_host')).toBe(true);
      expect(isConsentDenialEvent('recording_permission_denied')).toBe(true);
    });

    it('returns false for consent_granted', () => {
      expect(isConsentDenialEvent('consent_granted')).toBe(false);
    });
  });

  describe('getDenialReason', () => {
    it('returns human-readable reasons', () => {
      expect(getDenialReason('consent_denied_by_host')).toContain('Host');
      expect(getDenialReason('consent_denied_by_keyword')).toContain('Participant');
      expect(getDenialReason('bot_removed_by_host')).toContain('removed');
      expect(getDenialReason('recording_permission_denied')).toContain('permission');
    });
  });

  describe('getBotDisplayName fallback', () => {
    it('uses env BOT_NAME only when the tenant has no display name', () => {
      const env = { BOT_NAME: 'Env Recorder' };
      expect(getBotDisplayName(null, env)).toBe('Env Recorder');
      const settings: ConsentSettings = {
        botDisplayName: 'Tenant Notetaker',
        preJoinNotice: null,
        inCallNotice: null,
        stopKeywords: [],
      };
      expect(getBotDisplayName(settings, env)).toBe('Tenant Notetaker');
    });

    it('uses the built-in default when env BOT_NAME is empty', () => {
      expect(getBotDisplayName(null, { BOT_NAME: '  ' })).toBe(
        'Meeting Notetaker (recording transcript)'
      );
    });
  });

  describe('buildInCallAnnouncement', () => {
    it('uses the §5.4 disclosure sentence with bot and tenant names', () => {
      const message = buildInCallAnnouncement(null, {
        botName: 'Acme Notetaker',
        tenantName: 'Acme Notes',
      });
      expect(message).toBe(
        "Acme Notetaker is recording and transcribing for Acme Notes. Type 'stop' or ask the host to remove me."
      );
    });

    it('keeps the disclosure sentence when a custom notice is set', () => {
      const settings: ConsentSettings = {
        botDisplayName: null,
        preJoinNotice: null,
        inCallNotice: 'Please stay muted.',
        stopKeywords: [],
      };
      const message = buildInCallAnnouncement(settings, {
        botName: 'Acme Notetaker',
        tenantName: 'Acme Notes',
      });
      expect(message.startsWith('Acme Notetaker is recording and transcribing for Acme Notes.')).toBe(
        true
      );
      expect(message).toContain('Please stay muted.');
    });
  });

  describe('buildPreJoinNotice', () => {
    it('names the tenant, discloses recording, links privacy, and explains how to object', () => {
      const notice = buildPreJoinNotice(null, {
        tenantName: 'Acme Notes',
        privacyUrl: 'http://localhost:5173/privacy',
      });
      expect(notice).toContain('Acme Notes');
      expect(notice.toLowerCase()).toMatch(/record(ed| and transcribe)/);
      expect(notice).toContain('http://localhost:5173/privacy');
      expect(notice.toLowerCase()).toMatch(/consent|object|remove/);
    });
  });

});
