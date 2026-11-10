/**
 * Meeting processing job
 * Stub implementation for scaffold - full pipeline in FORGE Phase 1 (PR #3).
 *
 * FORGE must keep runTenantJob around every DB statement and require tenantId
 * on the job payload. Look up users via lookup_user_contact(), not SELECT FROM users.
 */

import type { Job } from 'bullmq';
import { logger } from '../lib/logger.js';
import { runTenantJob } from '../lib/tenantJob.js';

export interface ProcessMeetingData {
  meetingId: string;
  recallBotId: string;
  tenantId: string;
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

  logger.info({ meetingId, recallBotId, tenantId: job.data.tenantId }, 'Starting meeting processing (stub)');

  try {
    await runTenantJob(job.data, async (client) => {
      await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['processing', meetingId]
      );
    });

    await job.updateProgress(100);

    logger.info({ meetingId }, 'Meeting processing complete (stub)');

    return { success: true, meetingId };
  } catch (err) {
    logger.error({ meetingId, err }, 'Meeting processing failed');

    try {
      await runTenantJob(job.data, async (client) => {
        await client.query(
          'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
          ['failed', meetingId]
        );
      });
    } catch (dbErr) {
      logger.error({ dbErr }, 'Failed to update meeting status');
    }

    throw err;
  }
}
