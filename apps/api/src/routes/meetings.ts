/**
 * Meetings API routes
 * Stub implementation for scaffold - full implementation in PR B
 */

import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound, sendError, unauthenticated } from '../lib/http-error.js';

export const meetingsRouter = Router();

const UuidSchema = z.string().uuid();
const MAX_LIMIT = 100;

function parseLimitOffset(query: RequestQuery): { limit: number; offset: number } | null {
  const rawLimit = query.limit === undefined ? 20 : Number(query.limit);
  const rawOffset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isFinite(rawLimit) || !Number.isFinite(rawOffset)) {
    return null;
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)));
  const offset = Math.max(0, Math.trunc(rawOffset));
  return { limit, offset };
}

type RequestQuery = Record<string, unknown>;

meetingsRouter.get('/', async (req, res) => {
  const tenantId = req.auth?.tenant.id;
  if (!tenantId) {
    unauthenticated(res);
    return;
  }

  const page = parseLimitOffset(req.query as RequestQuery);
  if (!page) {
    badRequest(res, 'INVALID_LIMIT', 'limit and offset must be numbers');
    return;
  }

  try {
    const result = await withTenant(tenantId, (client) =>
      client.query(
      `SELECT 
         m.id, m.title, m.platform, m.status, m.started_at, m.ended_at,
         m.duration_seconds, m.language, m.created_at,
         ma.summary, ma.meeting_sentiment, ma.engagement_score,
         COALESCE(jsonb_array_length(ma.action_items), 0) as action_item_count
       FROM meetings m
       LEFT JOIN meeting_analysis ma ON ma.meeting_id = m.id
       WHERE m.tenant_id = $3
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [page.limit, page.offset, tenantId]
      )
    );

    res.json({
      meetings: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list meetings');
    sendError(res, 500, 'INTERNAL', 'Failed to fetch meetings');
  }
});

meetingsRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.auth?.tenant.id;
  if (!tenantId) {
    unauthenticated(res);
    return;
  }

  if (!UuidSchema.safeParse(id).success) {
    badRequest(res, 'INVALID_ID', 'Meeting id must be a UUID');
    return;
  }

  try {
    const loaded = await withTenant(tenantId, async (client) => {
      const meetingResult = await client.query(
        'SELECT * FROM meetings WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (meetingResult.rows.length === 0) {
        return null;
      }
      const [transcriptResult, analysisResult] = await Promise.all([
        client.query('SELECT * FROM transcripts WHERE meeting_id = $1 AND tenant_id = $2', [id, tenantId]),
        client.query('SELECT * FROM meeting_analysis WHERE meeting_id = $1 AND tenant_id = $2', [id, tenantId]),
      ]);
      return {
        meeting: meetingResult.rows[0],
        transcript: transcriptResult.rows[0] as Record<string, unknown> | undefined,
        analysis: analysisResult.rows[0] as Record<string, unknown> | undefined,
      };
    });

    if (!loaded) {
      notFound(res, 'Meeting not found');
      return;
    }

    const { meeting, transcript, analysis } = loaded;

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
    sendError(res, 500, 'INTERNAL', 'Failed to fetch meeting');
  }
});
