/**
 * Meeting Processing Worker
 * Orchestrates the full pipeline when a meeting recording is ready:
 * 1. Download recording from Recall.ai
 * 2. Transcribe with AssemblyAI  
 * 3. Analyze with Claude
 * 4. Store results in DB
 * 5. Send email notifications
 */

require('dotenv').config();
const Bull = require('bull');
const db = require('../utils/db');
const logger = require('../utils/logger');
const transcriptionService = require('../services/transcriptionService');
const analysisService = require('../services/analysisService');
const emailService = require('../services/emailService');

const meetingQueue = new Bull('meeting-processing', {
  redis: process.env.REDIS_URL
});

const QUEUE_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  removeOnComplete: 100,
  removeOnFail: 50
};

/**
 * Add a meeting to the processing queue
 */
const queueMeetingProcessing = async (meetingId, recordingUrl) => {
  const job = await meetingQueue.add(
    { meetingId, recordingUrl },
    QUEUE_OPTIONS
  );
  logger.info('Meeting queued for processing', { meetingId, jobId: job.id });
  return job.id;
};

/**
 * Main processing pipeline
 */
meetingQueue.process(async (job) => {
  const { meetingId, recordingUrl } = job.data;
  
  logger.info('Starting meeting processing pipeline', { meetingId, jobId: job.id });

  try {
    // Step 1: Update status to processing
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', meetingId]
    );

    // Step 2: Transcribe the recording
    job.progress(20);
    logger.info('Transcribing recording...', { meetingId });
    
    const transcript = await transcriptionService.transcribeRecording(recordingUrl);
    
    // Step 3: Store transcript in DB
    job.progress(50);
    const transcriptResult = await db.query(
      `INSERT INTO transcripts (meeting_id, raw_transcript, full_text, speakers, word_count)
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (meeting_id) DO UPDATE SET
         raw_transcript = EXCLUDED.raw_transcript,
         full_text = EXCLUDED.full_text,
         speakers = EXCLUDED.speakers,
         word_count = EXCLUDED.word_count
       RETURNING id`,
      [
        meetingId,
        JSON.stringify(transcript.utterances),
        transcript.formatted_transcript,
        JSON.stringify(transcript.speakers),
        transcript.word_count
      ]
    );

    // Step 4: Fetch meeting details for context
    const meetingResult = await db.query('SELECT * FROM meetings WHERE id = $1', [meetingId]);
    const meeting = meetingResult.rows[0];

    // Step 5: AI Analysis
    job.progress(70);
    logger.info('Running AI analysis...', { meetingId });
    
    const analysis = await analysisService.analyzeMeeting(transcript, {
      title: meeting.title,
      date: meeting.started_at,
      platform: meeting.platform
    });

    // Step 6: Store analysis in DB
    await db.query(
      `INSERT INTO meeting_analysis 
        (meeting_id, summary, key_decisions, action_items, topics, meeting_sentiment, 
         engagement_score, talk_time, questions_raised, risks_identified, 
         next_meeting_agenda, raw_ai_response, model_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (meeting_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         key_decisions = EXCLUDED.key_decisions,
         action_items = EXCLUDED.action_items,
         topics = EXCLUDED.topics,
         meeting_sentiment = EXCLUDED.meeting_sentiment,
         engagement_score = EXCLUDED.engagement_score`,
      [
        meetingId,
        analysis.summary,
        JSON.stringify(analysis.key_decisions),
        JSON.stringify(analysis.action_items),
        JSON.stringify(analysis.topics_discussed),
        analysis.meeting_metrics?.overall_sentiment || 'neutral',
        analysis.meeting_metrics?.engagement_score || 50,
        JSON.stringify(transcript.speakers),
        JSON.stringify(analysis.questions_unresolved),
        JSON.stringify(analysis.risks_and_blockers),
        JSON.stringify(analysis.next_meeting_suggestions?.recommended_agenda),
        analysis.raw_ai_response,
        analysis.model_used
      ]
    );

    // Step 7: Send email notifications
    job.progress(90);
    
    // Get user email
    const userResult = await db.query(
      'SELECT u.email, u.name FROM users u JOIN meetings m ON m.user_id = u.id WHERE m.id = $1',
      [meetingId]
    );
    
    if (userResult.rows.length > 0) {
      await emailService.sendMeetingNotes({
        meeting,
        transcript,
        analysis,
        recipients: [userResult.rows[0].email]
      });
    }

    // Step 8: Mark as completed
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['completed', meetingId]
    );

    job.progress(100);
    logger.info('Meeting processing pipeline COMPLETE', { meetingId });
    
    return { success: true, meetingId };

  } catch (err) {
    logger.error('Meeting processing pipeline FAILED', { meetingId, error: err.message, stack: err.stack });
    
    // Mark meeting as failed
    await db.query(
      'UPDATE meetings SET status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', meetingId]
    ).catch(dbErr => logger.error('Failed to update meeting status', { dbErr }));

    throw err; // Re-throw so Bull retries
  }
});

// Queue event handlers
meetingQueue.on('completed', (job, result) => {
  logger.info('Job completed', { jobId: job.id, meetingId: job.data.meetingId });
});

meetingQueue.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job.id, meetingId: job.data.meetingId, error: err.message, attempts: job.attemptsMade });
});

meetingQueue.on('stalled', (job) => {
  logger.warn('Job stalled', { jobId: job.id, meetingId: job.data.meetingId });
});

logger.info('Meeting processing worker started');

module.exports = { meetingQueue, queueMeetingProcessing };
