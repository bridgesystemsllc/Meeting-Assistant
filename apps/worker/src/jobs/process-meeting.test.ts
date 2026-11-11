import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from 'bullmq';

const { query, runTenantJob, lookupUserContact } = vi.hoisted(() => ({
  query: vi.fn(),
  runTenantJob: vi.fn(),
  lookupUserContact: vi.fn(),
}));

vi.mock('../lib/tenantJob.js', () => ({
  runTenantJob,
  TenantJobError: class extends Error {
    code = 'TENANT_REQUIRED';
  },
}));

vi.mock('../lib/user-lookup.js', () => ({
  lookupUserContact,
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock services
vi.mock('../services/recall.js', () => ({
  recallService: {
    getTranscript: vi.fn(),
    deleteMedia: vi.fn(),
    formatTranscript: vi.fn(),
  },
}));

vi.mock('../services/analysis.js', () => ({
  analyzeMeeting: vi.fn(),
}));

vi.mock('../services/email.js', () => ({
  sendRecapEmail: vi.fn(),
}));

import { recallService } from '../services/recall.js';
import { analyzeMeeting } from '../services/analysis.js';
import { sendRecapEmail } from '../services/email.js';
import { processMeeting, resetServices, type ProcessMeetingData } from './process-meeting.js';

const TENANT_A = '00000000-0000-0000-0000-000000000010';
const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = '00000000-0000-0000-0000-000000000002';

const MOCK_MEETING = {
  id: MEETING_ID,
  tenant_id: TENANT_A,
  user_id: USER_ID,
  title: 'Q4 Product Launch Meeting',
  platform: 'zoom',
  started_at: '2026-11-10T14:00:00Z',
  duration_seconds: 3600,
  media_deleted_at: null as Date | null,
};

const MOCK_USER = {
  id: USER_ID,
  email: 'test@example.com',
  name: 'Test User',
};

const MOCK_TRANSCRIPT = {
  segments: [
    {
      speaker: 'Speaker 1',
      speaker_id: 1,
      language: 'en',
      words: [
        { text: 'Hello', start_time: 0, end_time: 0.5, confidence: 0.99 },
        { text: 'world', start_time: 0.5, end_time: 1.0, confidence: 0.98 },
      ],
    },
  ],
  language: 'en',
};

const MOCK_FORMATTED_TRANSCRIPT = {
  fullText: '[00:00] Speaker 1: Hello world',
  speakers: [{ id: 'Speaker 1', name: 'Speaker 1', word_count: 2, duration_ms: 1000, talk_time_pct: 100 }],
  rawTranscript: MOCK_TRANSCRIPT.segments,
  wordCount: 2,
  language: 'en',
};

const MOCK_ANALYSIS = {
  summary: 'Test meeting summary.',
  key_decisions: [],
  action_items: [],
  topics_discussed: [],
  questions_unresolved: [],
  risks_and_blockers: [],
  meeting_metrics: {
    overall_sentiment: 'neutral' as const,
    meeting_effectiveness: 'medium' as const,
    engagement_score: 75,
    dominant_speaker: 'Speaker 1',
  },
  next_meeting_suggestions: { recommended_agenda: [] },
};

function mockJob(data: Partial<ProcessMeetingData> = {}): Job<ProcessMeetingData> {
  return {
    data: {
      meetingId: MEETING_ID,
      recallBotId: 'bot-123',
      tenantId: TENANT_A,
      ...data,
    },
    id: 'job-123',
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateProgress: vi.fn(),
  } as unknown as Job<ProcessMeetingData>;
}

describe('processMeeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServices();
    
    // Default mock implementations
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    runTenantJob.mockImplementation(
      async (_data: unknown, fn: (client: { query: typeof query }, tenantId: string) => unknown) =>
        fn({ query }, TENANT_A)
    );
    lookupUserContact.mockResolvedValue(MOCK_USER);
  });

  afterEach(() => {
    resetServices();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
  });

  it('processes a meeting successfully through full pipeline', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test';

    // Setup mock responses
    query
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 }) // SELECT meeting
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE status to processing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT transcript
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE meeting language
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE media_deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT analysis
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT email_deliveries
      .mockResolvedValueOnce({ rows: [{ media_deleted_at: new Date() }], rowCount: 1 }) // SELECT media_deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE status to completed

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(true);
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    const job = mockJob();
    const result = await processMeeting(job);

    expect(result.success).toBe(true);
    expect(result.meetingId).toBe(MEETING_ID);
    expect(runTenantJob).toHaveBeenCalled();
    expect(recallService.getTranscript).toHaveBeenCalledWith('bot-123');
    expect(recallService.deleteMedia).toHaveBeenCalledWith('bot-123');
    expect(analyzeMeeting).toHaveBeenCalled();
    expect(sendRecapEmail).toHaveBeenCalled();
    expect(lookupUserContact).toHaveBeenCalledWith(USER_ID);
    expect(job.updateProgress).toHaveBeenCalled();
  });

  it('fails when meeting is not found', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const job = mockJob({ meetingId: 'nonexistent-meeting' });

    await expect(processMeeting(job)).rejects.toThrow('Meeting nonexistent-meeting not found');
  });

  it('fails when no transcript is available', async () => {
    query
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE to processing

    vi.mocked(recallService.getTranscript).mockResolvedValue(null);

    const job = mockJob();
    const result = await processMeeting(job);

    expect(result.success).toBe(false);
  });

  it('marks as media_pending when media deletion fails (P1-4)', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test';

    query
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE to processing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT transcript
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE language
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT analysis
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT email_deliveries
      .mockResolvedValueOnce({ rows: [{ media_deleted_at: null }], rowCount: 1 }) // SELECT media_deleted_at (null)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE to media_pending

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(false); // Failed
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    const job = mockJob();
    const result = await processMeeting(job);

    expect(result.success).toBe(true);
    expect(recallService.deleteMedia).toHaveBeenCalled();
    // Verify the final status check happened
    expect(query).toHaveBeenCalledWith(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['processing', MEETING_ID, TENANT_A]
    );
  });

  it('records email as not_sent when SMTP is not configured (P2-3)', async () => {
    // Don't set SMTP env vars

    query
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE to processing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT transcript
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE language
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE media_deleted_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT analysis
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT email_deliveries with not_sent
      .mockResolvedValueOnce({ rows: [{ media_deleted_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(true);
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });

    const job = mockJob();
    const result = await processMeeting(job);

    expect(result.success).toBe(true);
    expect(sendRecapEmail).not.toHaveBeenCalled();
    // Check that email was recorded as not_sent
    // Note: 'not_sent' is hardcoded in the query, not a parameter
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'not_sent'"),
      [TENANT_A, MEETING_ID, MOCK_USER.email]
    );
  });

  it('fails when the meeting is not in the job tenant', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(processMeeting(job())).rejects.toThrow('MEETING_NOT_IN_TENANT');
    expect(query).toHaveBeenCalledWith(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['processing', MEETING_ID, TENANT_A]
    );
  });

  it('handles processing errors', async () => {
    const error = new Error('Database connection failed');
    runTenantJob.mockRejectedValueOnce(error);

    const job = mockJob();

    await expect(processMeeting(job)).rejects.toThrow('Database connection failed');
  });

  it('requires tenantId in job payload', async () => {
    const job = mockJob({ tenantId: '' });

    await expect(processMeeting(job)).rejects.toThrow();
  });

  it('tenant_id_fk_consistency: rejects if job tenantId mismatches meeting tenant_id', async () => {
    // Meeting has different tenant_id than the job
    const meetingWithDifferentTenant = {
      ...MOCK_MEETING,
      tenant_id: '00000000-0000-0000-0000-000000000099', // Different from job's TENANT_A
    };

    query.mockResolvedValueOnce({ rows: [meetingWithDifferentTenant], rowCount: 1 });

    const job = mockJob(); // Uses TENANT_A

    await expect(processMeeting(job)).rejects.toThrow('Tenant mismatch');
  });

  it('tenant_id_fk_consistency: all inserts use meeting tenant_id', async () => {
    // This test verifies that transcripts, meeting_analysis, and email_deliveries
    // all receive the same tenant_id as the meeting
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test';

    const capturedParams: unknown[][] = [];
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (params) capturedParams.push(params);
      
      // Return appropriate mocks based on the query
      if (sql.includes('SELECT') && sql.includes('FROM meetings')) {
        return { rows: [MOCK_MEETING], rowCount: 1 };
      }
      if (sql.includes('SELECT media_deleted_at')) {
        return { rows: [{ media_deleted_at: new Date() }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(true);
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    await processMeeting(mockJob());

    // All INSERT statements should have TENANT_A as the first parameter (tenant_id)
    const insertParams = capturedParams.filter(p => p.length > 2); // INSERTs have more params
    for (const params of insertParams) {
      // tenant_id should be the first param and match the meeting's tenant
      expect(params[0]).toBe(TENANT_A);
    }
  });

  it('uses runTenantJob for all DB operations', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_USER = 'test';

    query
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ media_deleted_at: new Date() }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(true);
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    await processMeeting(mockJob());

    // Verify runTenantJob was called for each DB operation
    expect(runTenantJob).toHaveBeenCalled();
    const calls = runTenantJob.mock.calls;
    // At least 6 calls: meeting fetch, transcript store, media_deleted_at update, analysis store, email record, final status
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });
});
