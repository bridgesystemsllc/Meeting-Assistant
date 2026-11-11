/**
 * Meetings API routes
 * Stub implementation for scaffold - full implementation in PR B
 */

import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export const meetingsRouter = Router();

/**
 * GET /api/meetings
 * List meetings (stub - auth/tenant filtering in Phase 2)
 */
meetingsRouter.get('/', async (req, res) => {
  const { limit = '20', offset = '0' } = req.query;

  try {
    const result = await db.query(
      `SELECT 
         m.id, m.title, m.platform, m.status, m.started_at, m.ended_at,
         m.duration_seconds, m.language, m.created_at,
         ma.summary, ma.meeting_sentiment, ma.engagement_score,
         COALESCE(jsonb_array_length(ma.action_items), 0) as action_item_count
       FROM meetings m
       LEFT JOIN meeting_analysis ma ON ma.meeting_id = m.id
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit as string), parseInt(offset as string)]
    );

    res.json({
      meetings: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list meetings');
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

/**
 * GET /api/meetings/:id
 * Get meeting details (stub - auth/tenant filtering in Phase 2)
 */
meetingsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const meetingResult = await db.query(
      'SELECT * FROM meetings WHERE id = $1',
      [id]
    );

    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const transcriptResult = await db.query(
      'SELECT * FROM transcripts WHERE meeting_id = $1',
      [id]
    );

    const analysisResult = await db.query(
      'SELECT * FROM meeting_analysis WHERE meeting_id = $1',
      [id]
    );

    const meeting = meetingResult.rows[0];
    const transcript = transcriptResult.rows[0] as Record<string, unknown> | undefined;
    const analysis = analysisResult.rows[0] as Record<string, unknown> | undefined;

    res.json({
      meeting,
      transcript: transcript
        ? {
            fullText: transcript.full_text,
            speakers: transcript.speakers,
            wordCount: transcript.word_count,
            language: transcript.language,
          }
        : null,
      analysis: analysis
        ? {
            summary: analysis.summary,
            key_decisions: analysis.key_decisions,
            action_items: analysis.action_items,
            topics_discussed: analysis.topics,
            meeting_metrics: {
              overall_sentiment: analysis.meeting_sentiment,
              engagement_score: analysis.engagement_score,
            },
            questions_unresolved: analysis.questions_raised,
            risks_and_blockers: analysis.risks_identified,
            next_meeting_suggestions: {
              recommended_agenda: analysis.next_meeting_agenda,
            },
          }
        : null,
    });
  } catch (err) {
    logger.error({ err, id }, 'Failed to get meeting');
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});
