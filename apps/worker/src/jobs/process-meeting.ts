/**
 * Meeting Processing Job
 * Full pipeline: Recall transcript → media delete → Claude analysis → recap email
 * 
 * Order matters:
 * 1. Fetch transcript from Recall
 * 2. Delete Recall media (transcript-only, no stored audio)
 * 3. Run Claude analysis
 * 4. Store results
 * 5. Send recap email to owner
 * 6. Mark completed
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
 * Process a meeting recording
 */
export async function processMeeting(
  job: Job<ProcessMeetingData>
): Promise<ProcessMeetingResult> {
  const { meetingId, recallBotId } = job.data;

  logger.info({ meetingId, recallBotId }, 'Starting meeting processing');

  try {
    // Get meeting details
    const meetingResult = await db.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      title: string;
      platform: string;
      started_at: string | null;
      duration_seconds: number | null;
    }>(
      'SELECT id, tenant_id, user_id, title, platform, started_at, duration_seconds FROM meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];
    const tenantId = meeting.tenant_id;

    // Update status to processing
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', meetingId]
    );

    await job.updateProgress(10);

    // Step 1: Fetch transcript from Recall
    logger.info({ meetingId, recallBotId }, 'Fetching transcript from Recall');
    const recall = await getRecallService();
    const recallTranscript = await recall.getTranscript(recallBotId);

    if (!recallTranscript || !recallTranscript.segments?.length) {
      logger.warn({ meetingId, recallBotId }, 'No transcript available');
      await db.query(
        'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', meetingId]
      );
      return { success: false, meetingId };
    }

    await job.updateProgress(30);

    // Step 2: Delete Recall media BEFORE marking completed
    // This implements transcript-only mode (no stored audio)
    logger.info({ meetingId, recallBotId }, 'Deleting Recall media');
    const mediaDeleted = await recall.deleteMedia(recallBotId);
    
    if (!mediaDeleted) {
      logger.warn({ meetingId, recallBotId }, 'Media deletion failed, continuing anyway');
    }

    await job.updateProgress(40);

    // Format transcript
    const formattedTranscript = recall.formatTranscript(recallTranscript);

    // Step 3: Store transcript
    await db.query(
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
      await db.query(
        'UPDATE meetings SET language = $1 WHERE id = $2',
        [formattedTranscript.language, meetingId]
      );
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
    await db.query(
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
        JSON.stringify(formattedTranscript.speakers),
        JSON.stringify(analysis.questions_unresolved),
        JSON.stringify(analysis.risks_and_blockers),
        JSON.stringify(analysis.next_meeting_suggestions?.recommended_agenda || []),
        rawResponse,
        model,
      ]
    );

    await job.updateProgress(85);

    // Step 6: Send recap email to owner only
    const userResult = await db.query<{ email: string; name: string }>(
      'SELECT email, name FROM users WHERE id = $1',
      [meeting.user_id]
    );

    if (userResult.rows.length > 0) {
      const owner = userResult.rows[0];
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
        ownerName: owner.name,
        language: formattedTranscript.language,
      });

      // Log email delivery
      await db.query(
        `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, sent_at, status)
         VALUES ($1, $2, $3, NOW(), 'sent')`,
        [tenantId, meetingId, owner.email]
      );
    }

    await job.updateProgress(95);

    // Step 7: Mark as completed
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['completed', meetingId]
    );

    await job.updateProgress(100);

    logger.info({ meetingId }, 'Meeting processing complete');

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

/**
 * For testing: reset service imports
 */
export function resetServices(): void {
  recallService = null;
  analyzeMeeting = null;
  sendRecapEmail = null;
}
