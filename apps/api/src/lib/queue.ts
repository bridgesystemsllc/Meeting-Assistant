/**
 * BullMQ queue interface for API
 * Enqueues jobs for the worker to process
 */

import { Queue } from 'bullmq';
import { redis } from './redis.js';
import { logger } from './logger.js';

const QUEUE_NAME = 'meeting-processing';

// Create the queue (same queue name as worker)
const meetingQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

/**
 * Add a meeting to the processing queue.
 * P1-6: Wire E2E - enqueue process-meeting job on bot.done
 * Uses botId + event type as jobId for deduplication.
 * tenantId is required so the worker can run under withTenant.
 */
export async function queueMeetingProcessing(
  meetingId: string,
  recallBotId: string,
  tenantId: string
): Promise<string> {
  if (!tenantId) {
    throw new Error('TENANT_REQUIRED');
  }

  // Use meeting:${meetingId} as jobId for deduplication
  const jobId = `meeting:${meetingId}`;

  const job = await meetingQueue.add(
    'process',
    { meetingId, recallBotId, tenantId },
    { jobId }
  );

  logger.info({ meetingId, tenantId, jobId: job.id }, 'Meeting queued for processing');
  return job.id!;
}
