/**
 * [PRODUCT NAME] Worker
 * BullMQ worker for processing meeting recordings
 */

import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { redis } from './lib/redis.js';
import { logger } from './lib/logger.js';
import { processMeeting } from './jobs/process-meeting.js';
import { assertConnectedAppRole } from './lib/app-role.js';
import { assertWorkerRuntimeEnv } from './lib/env.js';

if (process.env.NODE_ENV !== 'test') {
  try {
    assertWorkerRuntimeEnv();
    await assertConnectedAppRole();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

const QUEUE_NAME = 'meeting-processing';

// Create the queue
export const meetingQueue = new Queue(QUEUE_NAME, {
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

// Create the worker
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    logger.info(
      { jobId: job.id, meetingId: job.data.meetingId, tenantId: job.data.tenantId },
      'Processing job'
    );
    return processMeeting(job);
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

worker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, meetingId: job.data.meetingId, result }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      meetingId: job?.data?.meetingId,
      err,
      attempts: job?.attemptsMade,
    },
    'Job failed'
  );
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Job stalled');
});

logger.info({ queue: QUEUE_NAME }, 'Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down worker...');
  await worker.close();
  await meetingQueue.close();
  process.exit(0);
});

/**
 * Add a meeting to the processing queue.
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
