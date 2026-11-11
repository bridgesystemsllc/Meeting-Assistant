import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/db.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { db } from '../lib/db.js';
import { processMeeting, type ProcessMeetingData } from './process-meeting.js';
import type { Job } from 'bullmq';

describe('processMeeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates meeting status to processing', async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [], rowCount: 1 } as never);

    const mockJob = {
      data: {
        meetingId: '123e4567-e89b-12d3-a456-426614174000',
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    const result = await processMeeting(mockJob);

    expect(db.query).toHaveBeenCalledWith(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', '123e4567-e89b-12d3-a456-426614174000']
    );
    expect(result.success).toBe(true);
    expect(result.meetingId).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('handles processing errors', async () => {
    const error = new Error('Database connection failed');
    vi.mocked(db.query)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const mockJob = {
      data: {
        meetingId: '123e4567-e89b-12d3-a456-426614174000',
        recallBotId: 'bot-123',
      },
      updateProgress: vi.fn(),
    } as unknown as Job<ProcessMeetingData>;

    await expect(processMeeting(mockJob)).rejects.toThrow('Database connection failed');
  });
});
