/**
 * Meeting Processing Job
 * Full pipeline: Recall transcript → media delete → Claude analysis → recap email
 * 
 * P1-4: Persist transcript FIRST, track media_deleted_at, never mark completed while NULL
 * P2-3: SMTP unset → record email_deliveries status 'not_sent'
 * P3-1: DLQ for process-meeting after final retry
 * 
 * Uses runTenantJob around every DB statement and requires tenantId on job payload.
 * Uses lookupUserContact(), not direct SELECT FROM users.
 */

import type { Job } from 'bullmq';
import type { PoolClient } from 'pg';
import { logger } from '../lib/logger.js';
import { runTenantJob, TenantJobError } from '../lib/tenantJob.js';
import { lookupUserContact } from '../lib/user-lookup.js';

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

  // Validate tenant early
  if (!tenantId) {
    throw new TenantJobError('Missing tenantId in job payload');
  }

  logger.info({ meetingId, recallBotId, tenantId }, 'Starting meeting processing');

  try {
    // Get meeting details and update status to processing
    const meeting = await runTenantJob(job.data, async (client) => {
      const result = await client.query<{
        id: string;
        tenant_id: string;
        user_id: string;
        title: string;
        platform: string;
        started_at: string | null;
        duration_seconds: number | null;
        media_deleted_at: Date | null;
      }>(
        `SELECT id, tenant_id, user_id, title, platform, started_at, duration_seconds, media_deleted_at 
         FROM meetings WHERE id = $1`,
        [meetingId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Meeting ${meetingId} not found`);
      }

      // Update status to processing
      await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['processing', meetingId]
      );

      return result.rows[0];
    });

    await job.updateProgress(10);

    // Step 1: Fetch transcript from Recall
    logger.info({ meetingId, recallBotId }, 'Fetching transcript from Recall');
    const recall = await getRecallService();
    const recallTranscript = await recall.getTranscript(recallBotId);

    if (!recallTranscript || !recallTranscript.segments?.length) {
      logger.warn({ meetingId, recallBotId }, 'No transcript available');
      await runTenantJob(job.data, async (client) => {
        await client.query(
          'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
          ['failed', meetingId]
        );
      });
      return { success: false, meetingId };
    }

    await job.updateProgress(30);

    // Format transcript
    const formattedTranscript = recall.formatTranscript(recallTranscript);

    // P1-4: Step 2 - Store transcript FIRST (before media delete)
    await runTenantJob(job.data, async (client) => {
      await client.query(
        `INSERT INTO transcripts (tenant_id, meeting_id, raw_transcript, full_text, speakers, word_count, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (meeting_id) DO UPDATE SET
           raw_transcript = EXCLUDED.raw_transcript,
           full_text = EXCLUDED.full_text,
           speakers = EXCLUDED.speakers,
           word_count = EXCLUDED.word_count,
           language = EXCLUDED.language`,
        [
          tenantId,
          meetingId,
          JSON.stringify(formattedTranscript.rawTranscript),
          formattedTranscript.fullText,
          JSON.stringify(formattedTranscript.speakers),
          formattedTranscript.wordCount,
          formattedTranscript.language,
        ]
      );

      // Update meeting with detected language
      if (formattedTranscript.language) {
        await client.query(
          'UPDATE meetings SET language = $1 WHERE id = $2',
          [formattedTranscript.language, meetingId]
        );
      }
    });

    await job.updateProgress(40);

    // P1-4: Step 3 - Delete Recall media (AFTER transcript is persisted)
    logger.info({ meetingId, recallBotId }, 'Deleting Recall media');
    const mediaDeleted = await recall.deleteMedia(recallBotId);
    
    if (mediaDeleted) {
      // Track media deletion time
      await runTenantJob(job.data, async (client) => {
        await client.query(
          'UPDATE meetings SET media_deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
          [meetingId]
        );
      });
      logger.info({ meetingId, recallBotId }, 'Media deleted successfully');
    } else {
      // P1-4: Media deletion failed - continue but never mark completed later
      logger.warn({ meetingId, recallBotId }, 'Media deletion failed');
    }

    await job.updateProgress(50);

    // Step 4: Run Claude analysis
    logger.info({ meetingId }, 'Running AI analysis');
    const analyze = await getAnalyzeMeeting();
    const { analysis, rawResponse, model } = await analyze(
      {
        fullText: formattedTranscript.fullText,
        speakers: formattedTranscript.speakers,
        wordCount: formattedTranscript.wordCount,
        language: formattedTranscript.language,
      },
      {
        title: meeting.title,
        date: meeting.started_at || undefined,
        platform: meeting.platform,
        tenantId,
      }
    );

    await job.updateProgress(70);

    // Step 5: Store analysis
    await runTenantJob(job.data, async (client) => {
      await storeAnalysis(client, tenantId, meetingId, analysis, formattedTranscript.speakers, rawResponse, model);
    });

    await job.updateProgress(85);

    // Step 6: Send recap email to owner only (using lookupUserContact)
    const owner = await lookupUserContact(meeting.user_id);

    if (owner) {
      if (isSmtpConfigured()) {
        const sendEmail = await getSendRecapEmail();
        
        await sendEmail({
          meeting: {
            id: meetingId,
            title: meeting.title,
            started_at: meeting.started_at,
            duration_seconds: meeting.duration_seconds,
          },
          analysis,
          ownerEmail: owner.email,
          ownerName: owner.name || undefined,
          language: formattedTranscript.language,
        });

        // Log email delivery as sent
        await runTenantJob(job.data, async (client) => {
          await client.query(
            `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, sent_at, status)
             VALUES ($1, $2, $3, NOW(), 'sent')`,
            [tenantId, meetingId, owner.email]
          );
        });
        logger.info({ meetingId, recipientEmail: owner.email }, 'Recap email sent');
      } else {
        // P2-3: SMTP unset - record as 'not_sent'
        await runTenantJob(job.data, async (client) => {
          await client.query(
            `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, status)
             VALUES ($1, $2, $3, 'not_sent')`,
            [tenantId, meetingId, owner.email]
          );
        });
        logger.info({ meetingId }, 'SMTP not configured, email not sent');
      }
    } else {
      // P3-2: Don't log owner email, log user id instead
      logger.warn({ meetingId, userId: meeting.user_id }, 'Owner not found for recap email');
    }

    await job.updateProgress(95);

    // P1-4: Check media_deleted_at before marking completed
    const canComplete = await runTenantJob(job.data, async (client) => {
      const result = await client.query<{ media_deleted_at: Date | null }>(
        'SELECT media_deleted_at FROM meetings WHERE id = $1',
        [meetingId]
      );
      return result.rows[0]?.media_deleted_at != null;
    });

    // Step 7: Mark as completed (only if media was deleted)
    const finalStatus = canComplete ? 'completed' : 'media_pending';
    await runTenantJob(job.data, async (client) => {
      await client.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
        [finalStatus, meetingId]
      );
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
