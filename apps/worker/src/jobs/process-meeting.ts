/**
 * Meeting processing job
 * Stub implementation for scaffold - full pipeline in FORGE Phase 1 (PR #3).
 *
 * FORGE must keep runTenantJob around every DB statement and require tenantId
 * on the job payload. Look up users via lookup_user_contact(), not SELECT FROM users.
 * A 0-row UPDATE is a failure (wrong tenant or missing meeting), not success.
 */

import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { logger } from '../lib/logger.js';
import { runTenantJob, TenantJobError } from '../lib/tenantJob.js';
import { lookupUserContact } from '../lib/user-lookup.js';

export const MEETING_NOT_IN_TENANT = 'MEETING_NOT_IN_TENANT';

export interface ProcessMeetingData {
  meetingId: string;
  recallBotId: string;
  tenantId: string;
}

export interface ProcessMeetingResult {
  success: boolean;
  meetingId: string;
  dlq?: boolean;
}

// Service imports are dynamic to support mocking in tests
let recallService: typeof import('../services/recall.js').recallService | null = null;
let analyzeMeeting: typeof import('../services/analysis.js').analyzeMeeting | null = null;
let sendRecapEmail: typeof import('../services/email.js').sendRecapEmail | null = null;

async function getRecallService() {
  if (!recallService) {
    const mod = await import('../services/recall.js');
    recallService = mod.recallService;
  }
  return recallService;
}

async function getAnalyzeMeeting() {
  if (!analyzeMeeting) {
    const mod = await import('../services/analysis.js');
    analyzeMeeting = mod.analyzeMeeting;
  }
  return analyzeMeeting;
}

async function getSendRecapEmail() {
  if (!sendRecapEmail) {
    const mod = await import('../services/email.js');
    sendRecapEmail = mod.sendRecapEmail;
  }
  return sendRecapEmail;
}

/**
 * Check if SMTP is configured
 */
function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

/**
 * P3-1: Check if this is the final retry
 */
function isFinalRetry(job: Job<ProcessMeetingData>): boolean {
  const maxAttempts = job.opts.attempts ?? 3;
  return job.attemptsMade >= maxAttempts - 1;
}

/**
 * Process a meeting recording
 */
export async function processMeeting(
  job: Job<ProcessMeetingData>
): Promise<ProcessMeetingResult> {
  const { meetingId, recallBotId, tenantId } = job.data;

  logger.info({ meetingId, recallBotId, tenantId }, 'Starting meeting processing (stub)');

  try {
    await runTenantJob(job.data, async (client) => {
      const updated = await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        ['processing', meetingId, tenantId]
      );
      if (!updated.rowCount) {
        throw new Error(MEETING_NOT_IN_TENANT);
      }
    });

    await job.updateProgress(100);

    logger.info({ meetingId, status: finalStatus }, 'Meeting processing complete');

    return { success: true, meetingId };

  } catch (err) {
    logger.error({ meetingId, err }, 'Meeting processing failed');

    // P3-1: DLQ after final retry
    if (isFinalRetry(job)) {
      logger.warn({ meetingId, jobId: job.id }, 'Final retry failed, moving to DLQ');
      
      try {
        await runTenantJob(job.data, async (client) => {
          await client.query(
            `INSERT INTO processing_dlq (tenant_id, meeting_id, job_id, error, attempts, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (meeting_id) DO UPDATE SET
               error = EXCLUDED.error,
               attempts = EXCLUDED.attempts,
               updated_at = NOW()`,
            [tenantId, meetingId, job.id, String(err), job.attemptsMade + 1]
          );
          await client.query(
            'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
            ['dlq', meetingId]
          );
        });
      } catch (dlqErr) {
        logger.error({ dlqErr, meetingId }, 'Failed to add to DLQ');
      }

      return { success: false, meetingId, dlq: true };
    }

    try {
      await runTenantJob(job.data, async (client) => {
        await client.query(
          'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          ['failed', meetingId, tenantId]
        );
      });
    } catch (dbErr) {
      logger.error({ dbErr }, 'Failed to update meeting status');
    }

    throw err;
  }
}

interface AnalysisResult {
  summary: string;
  key_decisions: unknown[];
  action_items: unknown[];
  topics_discussed: unknown[];
  meeting_metrics: {
    overall_sentiment: string;
    engagement_score: number;
  };
  questions_unresolved: unknown[];
  risks_and_blockers: unknown[];
  next_meeting_suggestions?: {
    recommended_agenda?: unknown[];
  };
}

async function storeAnalysis(
  client: PoolClient,
  tenantId: string,
  meetingId: string,
  analysis: AnalysisResult,
  speakers: unknown,
  rawResponse: string,
  model: string
): Promise<void> {
  await client.query(
    `INSERT INTO meeting_analysis 
      (tenant_id, meeting_id, summary, key_decisions, action_items, topics, 
       meeting_sentiment, engagement_score, talk_time, questions_raised, 
       risks_identified, next_meeting_agenda, raw_ai_response, model_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (meeting_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       key_decisions = EXCLUDED.key_decisions,
       action_items = EXCLUDED.action_items,
       topics = EXCLUDED.topics,
       meeting_sentiment = EXCLUDED.meeting_sentiment,
       engagement_score = EXCLUDED.engagement_score,
       talk_time = EXCLUDED.talk_time,
       questions_raised = EXCLUDED.questions_raised,
       risks_identified = EXCLUDED.risks_identified,
       next_meeting_agenda = EXCLUDED.next_meeting_agenda`,
    [
      tenantId,
      meetingId,
      analysis.summary,
      JSON.stringify(analysis.key_decisions),
      JSON.stringify(analysis.action_items),
      JSON.stringify(analysis.topics_discussed),
      analysis.meeting_metrics.overall_sentiment,
      analysis.meeting_metrics.engagement_score,
      JSON.stringify(speakers),
      JSON.stringify(analysis.questions_unresolved),
      JSON.stringify(analysis.risks_and_blockers),
      JSON.stringify(analysis.next_meeting_suggestions?.recommended_agenda || []),
      rawResponse,
      model,
    ]
  );
}

/**
 * For testing: reset service imports
 */
export function resetServices(): void {
  recallService = null;
  analyzeMeeting = null;
  sendRecapEmail = null;
}
