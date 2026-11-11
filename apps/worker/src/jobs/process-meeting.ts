/**
 * Meeting processing job
 * Stub implementation for scaffold - full pipeline in PR B
 */

import type { Job } from 'bullmq';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface ProcessMeetingData {
  meetingId: string;
  recallBotId: string;
}

export interface ProcessMeetingResult {
  success: boolean;
  meetingId: string;
}

/**
 * Process a meeting recording
 * Full implementation in PR B:
 * 1. Fetch transcript from Recall.ai
 * 2. Delete Recall media (transcript-only)
 * 3. Run Claude analysis
 * 4. Store results
 * 5. Send recap email
 */
export async function processMeeting(
  job: Job<ProcessMeetingData>
): Promise<ProcessMeetingResult> {
  const { meetingId, recallBotId } = job.data;

  logger.info({ meetingId, recallBotId }, 'Starting meeting processing (stub)');

  try {
    // Update status to processing
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', meetingId]
    );

    // Full pipeline implementation in PR B:
    // - Recall transcript fetch
    // - Recall media delete
    // - Claude analysis with structured output
    // - Store transcript and analysis
    // - Send recap email to owner

    await job.updateProgress(100);

    logger.info({ meetingId }, 'Meeting processing complete (stub)');

    return { success: true, meetingId };
  } catch (err) {
    logger.error({ meetingId, err }, 'Meeting processing failed');

    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', meetingId]
    ).catch((dbErr) => logger.error({ dbErr }, 'Failed to update meeting status'));

    throw err;
  }
}
