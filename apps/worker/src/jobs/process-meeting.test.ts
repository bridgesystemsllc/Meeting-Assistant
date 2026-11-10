import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/db.js', () => ({
  db: {
    query: vi.fn(),
  },
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

import { db } from '../lib/db.js';
import { recallService } from '../services/recall.js';
import { analyzeMeeting } from '../services/analysis.js';
import { sendRecapEmail } from '../services/email.js';
import { processMeeting, resetServices, type ProcessMeetingData } from './process-meeting.js';
import type { Job } from 'bullmq';

const MOCK_MEETING = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  tenant_id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  title: 'Q4 Product Launch Meeting',
  platform: 'zoom',
  started_at: '2026-11-10T14:00:00Z',
  duration_seconds: 3600,
};

const MOCK_USER = {
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

describe('processMeeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetServices();
  });

  afterEach(() => {
    resetServices();
  });

  it('processes a meeting successfully through full pipeline', async () => {
    // Setup mock responses
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 } as never) // SELECT meeting
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // UPDATE status to processing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // INSERT transcript
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // UPDATE meeting language
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // INSERT analysis
      .mockResolvedValueOnce({ rows: [MOCK_USER], rowCount: 1 } as never) // SELECT user
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // INSERT email_deliveries
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // UPDATE status to completed

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(true);
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    const mockJob = {
      data: {
        meetingId: MOCK_MEETING.id,
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    const result = await processMeeting(mockJob);

    expect(result.success).toBe(true);
    expect(result.meetingId).toBe(MOCK_MEETING.id);
    expect(recallService.getTranscript).toHaveBeenCalledWith('bot-123');
    expect(recallService.deleteMedia).toHaveBeenCalledWith('bot-123');
    expect(analyzeMeeting).toHaveBeenCalled();
    expect(sendRecapEmail).toHaveBeenCalled();
    expect(mockJob.updateProgress).toHaveBeenCalledTimes(8);
  });

  it('fails when meeting is not found', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const mockJob = {
      data: {
        meetingId: 'nonexistent-meeting',
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    await expect(processMeeting(mockJob)).rejects.toThrow('Meeting nonexistent-meeting not found');
  });

  it('fails when no transcript is available', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // UPDATE to processing
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // UPDATE to failed

    vi.mocked(recallService.getTranscript).mockResolvedValue(null);

    const mockJob = {
      data: {
        meetingId: MOCK_MEETING.id,
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    const result = await processMeeting(mockJob);

    expect(result.success).toBe(false);
  });

  it('continues when media deletion fails', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [MOCK_MEETING], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [MOCK_USER], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    vi.mocked(recallService.getTranscript).mockResolvedValue(MOCK_TRANSCRIPT);
    vi.mocked(recallService.deleteMedia).mockResolvedValue(false); // Failed but continues
    vi.mocked(recallService.formatTranscript).mockReturnValue(MOCK_FORMATTED_TRANSCRIPT);
    vi.mocked(analyzeMeeting).mockResolvedValue({
      analysis: MOCK_ANALYSIS,
      rawResponse: '{}',
      model: 'claude-sonnet-4-20250514',
    });
    vi.mocked(sendRecapEmail).mockResolvedValue(true);

    const mockJob = {
      data: {
        meetingId: MOCK_MEETING.id,
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    const result = await processMeeting(mockJob);

    expect(result.success).toBe(true);
    expect(recallService.deleteMedia).toHaveBeenCalled();
  });

  it('handles database errors gracefully', async () => {
    const error = new Error('Database connection failed');
    vi.mocked(db.query)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // UPDATE to failed

    const mockJob = {
      data: {
        meetingId: MOCK_MEETING.id,
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    await expect(processMeeting(mockJob)).rejects.toThrow('Database connection failed');
  });
});
