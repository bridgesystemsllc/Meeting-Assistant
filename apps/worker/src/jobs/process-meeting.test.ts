import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

const { query, runTenantJob } = vi.hoisted(() => ({
  query: vi.fn(),
  runTenantJob: vi.fn(),
}));

vi.mock('../lib/tenantJob.js', () => ({
  runTenantJob,
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { processMeeting, type ProcessMeetingData } from './process-meeting.js';

const TENANT_A = '00000000-0000-0000-0000-000000000010';
const MEETING_ID = '123e4567-e89b-12d3-a456-426614174000';

function job(data: Partial<ProcessMeetingData> = {}): Job<ProcessMeetingData> {
  return {
    data: {
      meetingId: MEETING_ID,
      recallBotId: 'bot-123',
      tenantId: TENANT_A,
      ...data,
    },
    updateProgress: vi.fn(),
  } as unknown as Job<ProcessMeetingData>;
}

describe('processMeeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    runTenantJob.mockImplementation(
      async (_data: unknown, fn: (client: { query: typeof query }) => unknown) => fn({ query })
    );
  });

  it('updates meeting status to processing under the job tenant', async () => {
    const result = await processMeeting(job());

    expect(runTenantJob).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      ['processing', MEETING_ID, TENANT_A]
    );
    expect(result.success).toBe(true);
    expect(result.meetingId).toBe(MEETING_ID);
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
    runTenantJob
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(
        async (_data: unknown, fn: (client: { query: typeof query }) => unknown) => fn({ query })
      );

    await expect(processMeeting(job())).rejects.toThrow('Database connection failed');
  });
});
