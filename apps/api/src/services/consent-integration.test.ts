/**
 * Consent Denial Integration Tests
 * Tests against Postgres that on denial:
 * - Zero transcript/analysis/email rows exist
 * - Recall delete is called
 * - Webhook replay of denial is idempotent
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import pg from 'pg';
import {
  insertConsentEvent,
  updateMeetingConsentStatus,
  deleteStoredMeetingData,
  meetingHasStoredData,
  getConsentSettings,
  type DbClient,
} from './consent.js';
import { handleConsentDenial } from './consent-handler.js';

const hasPostgres = !!process.env.DATABASE_URL;
const SYNTHETIC_TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!hasPostgres)('Consent Denial Integration (Postgres)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Ensure required tables exist (from migrations)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id UUID PRIMARY KEY,
        retention_days INTEGER NOT NULL DEFAULT 365,
        bot_display_name VARCHAR(255),
        pre_join_notice TEXT,
        in_call_notice TEXT,
        stop_keywords TEXT[] DEFAULT ARRAY['stop recording', 'stop transcription', 'leave meeting'],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID NOT NULL,
        title VARCHAR(500) NOT NULL,
        platform VARCHAR(50) NOT NULL,
        meeting_url TEXT NOT NULL,
        recall_bot_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'scheduled',
        consent_status VARCHAR(50) DEFAULT 'pending',
        consent_denied_at TIMESTAMPTZ,
        consent_denied_reason VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        meeting_id UUID NOT NULL UNIQUE,
        full_text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS meeting_analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        meeting_id UUID NOT NULL UNIQUE,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        meeting_id UUID NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS consent_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        meeting_id UUID NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        event_source VARCHAR(100),
        actor_name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Insert test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug)
      VALUES ($1, 'Test Tenant', 'test-tenant')
      ON CONFLICT (id) DO NOTHING
    `, [SYNTHETIC_TENANT_ID]);

    await pool.query(`
      INSERT INTO users (id, email, name)
      VALUES ('00000000-0000-0000-0000-000000000002', 'test@example.com', 'Test User')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query("DELETE FROM consent_events WHERE tenant_id = $1", [SYNTHETIC_TENANT_ID]);
    await pool.query("DELETE FROM email_deliveries WHERE tenant_id = $1", [SYNTHETIC_TENANT_ID]);
    await pool.query("DELETE FROM meeting_analysis WHERE tenant_id = $1", [SYNTHETIC_TENANT_ID]);
    await pool.query("DELETE FROM transcripts WHERE tenant_id = $1", [SYNTHETIC_TENANT_ID]);
    await pool.query("DELETE FROM meetings WHERE tenant_id = $1", [SYNTHETIC_TENANT_ID]);
  });

  async function createTestMeeting(suffix: string): Promise<string> {
    const result = await pool.query<{ id: string }>(`
      INSERT INTO meetings (tenant_id, user_id, title, platform, meeting_url, recall_bot_id, status)
      VALUES ($1, '00000000-0000-0000-0000-000000000002', 'Test Meeting ' || $2, 'zoom', 'https://zoom.us/j/test', 'bot-' || $2, 'in_call')
      RETURNING id
    `, [SYNTHETIC_TENANT_ID, suffix]);
    return result.rows[0].id;
  }

  async function createTestData(meetingId: string): Promise<void> {
    await pool.query(`
      INSERT INTO transcripts (tenant_id, meeting_id, full_text)
      VALUES ($1, $2, 'Test transcript content')
    `, [SYNTHETIC_TENANT_ID, meetingId]);

    await pool.query(`
      INSERT INTO meeting_analysis (tenant_id, meeting_id, summary)
      VALUES ($1, $2, 'Test analysis summary')
    `, [SYNTHETIC_TENANT_ID, meetingId]);

    await pool.query(`
      INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email)
      VALUES ($1, $2, 'test@example.com')
    `, [SYNTHETIC_TENANT_ID, meetingId]);
  }

  describe('deleteStoredMeetingData', () => {
    it('should delete all stored data for a meeting', async () => {
      const meetingId = await createTestMeeting('delete-test');
      await createTestData(meetingId);

      // Verify data exists
      const beforeData = await meetingHasStoredData(pool, meetingId);
      expect(beforeData.hasTranscript).toBe(true);
      expect(beforeData.hasAnalysis).toBe(true);
      expect(beforeData.hasEmail).toBe(true);

      // Delete data
      const deleted = await deleteStoredMeetingData(pool, meetingId);
      expect(deleted.deletedTranscripts).toBe(1);
      expect(deleted.deletedAnalysis).toBe(1);
      expect(deleted.deletedEmails).toBe(1);

      // Verify data is gone
      const afterData = await meetingHasStoredData(pool, meetingId);
      expect(afterData.hasTranscript).toBe(false);
      expect(afterData.hasAnalysis).toBe(false);
      expect(afterData.hasEmail).toBe(false);
    });

    it('should handle meeting with no stored data', async () => {
      const meetingId = await createTestMeeting('no-data');

      const deleted = await deleteStoredMeetingData(pool, meetingId);
      expect(deleted.deletedTranscripts).toBe(0);
      expect(deleted.deletedAnalysis).toBe(0);
      expect(deleted.deletedEmails).toBe(0);
    });
  });

  describe('handleConsentDenial', () => {
    it('should delete all data and record consent event on denial', async () => {
      const meetingId = await createTestMeeting('denial-test');
      await createTestData(meetingId);

      // Mock Recall client
      const recallClient = {
        leaveMeeting: vi.fn().mockResolvedValue(undefined),
        deleteRecording: vi.fn().mockResolvedValue(undefined),
        deleteTranscript: vi.fn().mockResolvedValue(undefined),
      };

      // Handle consent denial
      const result = await handleConsentDenial(pool, recallClient, {
        meetingId,
        tenantId: SYNTHETIC_TENANT_ID,
        recallBotId: 'bot-denial-test',
        eventType: 'recording_permission_denied',
        eventSource: 'recall_webhook',
      });

      expect(result.success).toBe(true);
      expect(result.recallCleanupSuccess).toBe(true);
      expect(result.localCleanupSuccess).toBe(true);

      // Verify Recall cleanup was called
      expect(recallClient.leaveMeeting).toHaveBeenCalledWith('bot-denial-test');
      expect(recallClient.deleteRecording).toHaveBeenCalledWith('bot-denial-test');
      expect(recallClient.deleteTranscript).toHaveBeenCalledWith('bot-denial-test');

      // Verify all local data is deleted
      const storedData = await meetingHasStoredData(pool, meetingId);
      expect(storedData.hasTranscript).toBe(false);
      expect(storedData.hasAnalysis).toBe(false);
      expect(storedData.hasEmail).toBe(false);

      // Verify consent event was recorded
      const events = await pool.query(
        'SELECT * FROM consent_events WHERE meeting_id = $1',
        [meetingId]
      );
      expect(events.rows.length).toBe(1);
      expect(events.rows[0].event_type).toBe('recording_permission_denied');
      expect(events.rows[0].tenant_id).toBe(SYNTHETIC_TENANT_ID);
    });

    it('should update meeting consent status on denial', async () => {
      const meetingId = await createTestMeeting('status-test');

      const recallClient = {
        leaveMeeting: vi.fn().mockResolvedValue(undefined),
        deleteRecording: vi.fn().mockResolvedValue(undefined),
        deleteTranscript: vi.fn().mockResolvedValue(undefined),
      };

      await handleConsentDenial(pool, recallClient, {
        meetingId,
        tenantId: SYNTHETIC_TENANT_ID,
        recallBotId: 'bot-status-test',
        eventType: 'consent_denied_by_keyword',
        actorName: 'Test User',
      });

      // Verify meeting status updated
      const meeting = await pool.query(
        'SELECT consent_status, consent_denied_at, consent_denied_reason FROM meetings WHERE id = $1',
        [meetingId]
      );
      expect(meeting.rows[0].consent_status).toBe('denied');
      expect(meeting.rows[0].consent_denied_at).not.toBeNull();
      expect(meeting.rows[0].consent_denied_reason).toContain('requested');
    });

    it('should handle Recall cleanup failure gracefully', async () => {
      const meetingId = await createTestMeeting('recall-fail-test');
      await createTestData(meetingId);

      const recallClient = {
        leaveMeeting: vi.fn().mockRejectedValue(new Error('Network error')),
        deleteRecording: vi.fn().mockRejectedValue(new Error('Network error')),
        deleteTranscript: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const result = await handleConsentDenial(pool, recallClient, {
        meetingId,
        tenantId: SYNTHETIC_TENANT_ID,
        recallBotId: 'bot-recall-fail',
        eventType: 'recording_permission_denied',
      });

      // Recall cleanup should fail but local cleanup should succeed
      expect(result.recallCleanupSuccess).toBe(false);
      expect(result.localCleanupSuccess).toBe(true);

      // Consent event should still be recorded
      const events = await pool.query(
        'SELECT * FROM consent_events WHERE meeting_id = $1',
        [meetingId]
      );
      expect(events.rows.length).toBe(1);
    });
  });

  describe('consent denial webhook replay idempotency', () => {
    it('should be idempotent when processing same denial event twice', async () => {
      const meetingId = await createTestMeeting('idempotent-test');
      await createTestData(meetingId);

      const recallClient = {
        leaveMeeting: vi.fn().mockResolvedValue(undefined),
        deleteRecording: vi.fn().mockResolvedValue(undefined),
        deleteTranscript: vi.fn().mockResolvedValue(undefined),
      };

      // First denial
      await handleConsentDenial(pool, recallClient, {
        meetingId,
        tenantId: SYNTHETIC_TENANT_ID,
        recallBotId: 'bot-idempotent',
        eventType: 'recording_permission_denied',
        eventSource: 'recall_webhook',
      });

      // Reset mocks
      recallClient.leaveMeeting.mockClear();
      recallClient.deleteRecording.mockClear();
      recallClient.deleteTranscript.mockClear();

      // Second denial (replay)
      await handleConsentDenial(pool, recallClient, {
        meetingId,
        tenantId: SYNTHETIC_TENANT_ID,
        recallBotId: 'bot-idempotent',
        eventType: 'recording_permission_denied',
        eventSource: 'recall_webhook',
      });

      // Recall cleanup should be called again (idempotent operation)
      expect(recallClient.leaveMeeting).toHaveBeenCalled();

      // Data should still be zero (can't delete twice)
      const storedData = await meetingHasStoredData(pool, meetingId);
      expect(storedData.hasTranscript).toBe(false);
      expect(storedData.hasAnalysis).toBe(false);
      expect(storedData.hasEmail).toBe(false);

      // Two consent events should be recorded (both are valid events)
      const events = await pool.query(
        'SELECT * FROM consent_events WHERE meeting_id = $1 ORDER BY created_at',
        [meetingId]
      );
      expect(events.rows.length).toBe(2);
    });

    it('should handle parallel denial events safely', async () => {
      const meetingId = await createTestMeeting('parallel-test');
      await createTestData(meetingId);

      const recallClient = {
        leaveMeeting: vi.fn().mockResolvedValue(undefined),
        deleteRecording: vi.fn().mockResolvedValue(undefined),
        deleteTranscript: vi.fn().mockResolvedValue(undefined),
      };

      // Simulate 5 parallel denial events
      await Promise.all(
        Array.from({ length: 5 }, () =>
          handleConsentDenial(pool, recallClient, {
            meetingId,
            tenantId: SYNTHETIC_TENANT_ID,
            recallBotId: 'bot-parallel',
            eventType: 'recording_permission_denied',
            eventSource: 'parallel_test',
          })
        )
      );

      // Data should be deleted (regardless of race conditions)
      const storedData = await meetingHasStoredData(pool, meetingId);
      expect(storedData.hasTranscript).toBe(false);
      expect(storedData.hasAnalysis).toBe(false);
      expect(storedData.hasEmail).toBe(false);

      // Meeting should be marked as denied
      const meeting = await pool.query(
        'SELECT consent_status FROM meetings WHERE id = $1',
        [meetingId]
      );
      expect(meeting.rows[0].consent_status).toBe('denied');
    });
  });

  describe('consent settings', () => {
    it('should retrieve default settings when none configured', async () => {
      const settings = await getConsentSettings(pool, SYNTHETIC_TENANT_ID);
      expect(settings).toBeNull();
    });

    it('should retrieve custom settings when configured', async () => {
      await pool.query(`
        INSERT INTO tenant_settings (tenant_id, bot_display_name, pre_join_notice)
        VALUES ($1, 'Custom Notetaker', 'Custom notice')
        ON CONFLICT (tenant_id) DO UPDATE SET
          bot_display_name = 'Custom Notetaker',
          pre_join_notice = 'Custom notice'
      `, [SYNTHETIC_TENANT_ID]);

      const settings = await getConsentSettings(pool, SYNTHETIC_TENANT_ID);
      expect(settings).not.toBeNull();
      expect(settings?.botDisplayName).toBe('Custom Notetaker');
      expect(settings?.preJoinNotice).toBe('Custom notice');
    });
  });
});
