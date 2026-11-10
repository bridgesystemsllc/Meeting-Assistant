/**
 * Meetings API Routes
 * CRUD operations for meetings + triggering bot joins
 */

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const logger = require('../utils/logger');
const recallService = require('../services/recallService');

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * POST /api/meetings/join
 * Send a bot to join a meeting NOW
 */
router.post('/join',
  [
    body('meetingUrl').isURL().withMessage('Valid meeting URL required'),
    body('title').optional().isString(),
    body('userId').isUUID().withMessage('Valid user ID required'),
  ],
  validate,
  async (req, res) => {
    const { meetingUrl, title, userId } = req.body;

    try {
      // Detect platform from URL
      const platform = detectPlatform(meetingUrl);
      
      // Create meeting record
      const meetingId = uuidv4();
      await db.query(
        `INSERT INTO meetings (id, user_id, title, platform, meeting_url, status, started_at)
         VALUES ($1, $2, $3, $4, $5, 'bot_joining', NOW())`,
        [meetingId, userId, title || `Meeting ${new Date().toLocaleDateString()}`, platform, meetingUrl]
      );

      // Send bot to join
      const bot = await recallService.createBot({
        meetingUrl,
        botName: 'Meeting Recorder 🤖',
        meetingId
      });

      // Store bot ID
      await db.query(
        'UPDATE meetings SET recall_bot_id = $1 WHERE id = $2',
        [bot.id, meetingId]
      );

      logger.info('Meeting bot deployed', { meetingId, botId: bot.id, platform });

      res.status(201).json({
        success: true,
        meetingId,
        botId: bot.id,
        message: 'Bot is joining your meeting. Notes will be sent when the meeting ends.'
      });

    } catch (err) {
      logger.error('Failed to join meeting', { error: err.message });
      res.status(500).json({ error: 'Failed to deploy meeting bot', detail: err.message });
    }
  }
);

/**
 * GET /api/meetings
 * List meetings for a user
 */
router.get('/', async (req, res) => {
  const { userId, limit = 20, offset = 0 } = req.query;

  try {
    const result = await db.query(
      `SELECT 
         m.*,
         ma.summary,
         ma.meeting_sentiment,
         ma.engagement_score,
         (SELECT COUNT(*) FROM (SELECT jsonb_array_elements(ma.action_items)) AS ai) as action_item_count
       FROM meetings m
       LEFT JOIN meeting_analysis ma ON ma.meeting_id = m.id
       WHERE m.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    res.json({
      meetings: result.rows,
      total: result.rowCount
    });

  } catch (err) {
    logger.error('Failed to list meetings', { userId, error: err.message });
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

/**
 * GET /api/meetings/:id
 * Get full meeting details including transcript and analysis
 */
router.get('/:id',
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    const { id } = req.params;

    try {
      // Get meeting
      const meetingResult = await db.query('SELECT * FROM meetings WHERE id = $1', [id]);
      if (meetingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      // Get transcript
      const transcriptResult = await db.query(
        'SELECT * FROM transcripts WHERE meeting_id = $1',
        [id]
      );

      // Get analysis
      const analysisResult = await db.query(
        'SELECT * FROM meeting_analysis WHERE meeting_id = $1',
        [id]
      );

      const meeting = meetingResult.rows[0];
      const transcript = transcriptResult.rows[0] || null;
      const analysis = analysisResult.rows[0] || null;

      res.json({
        meeting,
        transcript: transcript ? {
          fullText: transcript.full_text,
          speakers: transcript.speakers,
          wordCount: transcript.word_count
        } : null,
        analysis: analysis ? {
          summary: analysis.summary,
          keyDecisions: analysis.key_decisions,
          actionItems: analysis.action_items,
          topics: analysis.topics,
          sentiment: analysis.meeting_sentiment,
          engagementScore: analysis.engagement_score,
          talkTime: analysis.talk_time,
          questionsRaised: analysis.questions_raised,
          risksIdentified: analysis.risks_identified,
          nextMeetingAgenda: analysis.next_meeting_agenda
        } : null
      });

    } catch (err) {
      logger.error('Failed to get meeting', { id, error: err.message });
      res.status(500).json({ error: 'Failed to fetch meeting' });
    }
  }
);

/**
 * DELETE /api/meetings/:id/bot
 * Remove bot from an ongoing meeting
 */
router.delete('/:id/bot',
  [param('id').isUUID()],
  validate,
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await db.query(
        'SELECT recall_bot_id FROM meetings WHERE id = $1',
        [id]
      );

      if (!result.rows[0]?.recall_bot_id) {
        return res.status(404).json({ error: 'No active bot found for this meeting' });
      }

      await recallService.removeBot(result.rows[0].recall_bot_id);
      
      res.json({ success: true, message: 'Bot removed from meeting' });

    } catch (err) {
      logger.error('Failed to remove bot', { id, error: err.message });
      res.status(500).json({ error: 'Failed to remove bot' });
    }
  }
);

/**
 * Detect meeting platform from URL
 */
function detectPlatform(url) {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('meet.google.com')) return 'google_meet';
  if (url.includes('teams.microsoft.com')) return 'teams';
  if (url.includes('webex.com')) return 'webex';
  return 'unknown';
}

module.exports = router;
