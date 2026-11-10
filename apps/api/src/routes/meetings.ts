/**
 * Meetings API routes.
 * Every handler runs DB work under withTenant(session tenant).
 * Cross-tenant ids return 404, never 403 (spec §5.7 / P0-3).
 *
 * FORGE Phase 1 POST /api/v1/meetings (Recall bot create) must keep this
 * withTenant wrapping and must set tenant_id from the session, not the body.
 *
 * Seat check before bot dispatch (ATLAS Q11): `meetingsRouter.use(requireActiveSeat)`
 * runs for every method, including a future POST. Call `assertActiveSeat(req.auth)`
 * from `apps/api/src/lib/seats.ts` if Phase 1 (PR #3) registers POST elsewhere.
 */

import { Router } from 'express';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound, parseUuidParam, unauthenticated } from '../lib/http-error.js';
import { requireActiveSeat } from '../lib/seats.js';

export const meetingsRouter = Router();

meetingsRouter.use(requireActiveSeat);

function requireTenantId(req: { auth?: { tenant: { id: string } } }): string | null {
  return req.auth?.tenant.id ?? null;
}

/**
 * GET /api/v1/meetings
 */
meetingsRouter.get('/', async (req, res) => {
  const { limit = '20', offset = '0' } = req.query;
  const tenantId = requireTenantId(req);
  if (!tenantId) {
    unauthenticated(res);
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
         ORDER BY m.created_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit as string, 10), parseInt(offset as string, 10)]
      )
    );

    res.json({
      meetings: result.rows,
      total: result.rowCount,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list meetings');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to fetch meetings' } });
  }
});

/**
 * GET /api/v1/meetings/:id
 * Missing or cross-tenant → 404 NOT_FOUND.
 */
meetingsRouter.get('/:id', async (req, res) => {
  const id = parseUuidParam(req.params.id);
  const tenantId = requireTenantId(req);
  if (!tenantId) {
    unauthenticated(res);
    return;
  }
  if (!id) {
    badRequest(res, 'INVALID_ID', 'Meeting id must be a UUID');
    return;
  }

  try {
    const loaded = await withTenant(tenantId, async (client) => {
      const meetingResult = await client.query('SELECT * FROM meetings WHERE id = $1', [id]);
      if (meetingResult.rows.length === 0) {
        return null;
      }
      const [transcriptResult, analysisResult] = await Promise.all([
        client.query('SELECT * FROM transcripts WHERE meeting_id = $1', [id]),
        client.query('SELECT * FROM meeting_analysis WHERE meeting_id = $1', [id]),
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
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to fetch meeting' } });
  }
});

/**
 * DELETE /api/v1/meetings/:id
 * Cross-tenant → 404. Write isolation is enforced by RLS WITH CHECK / USING.
 */
meetingsRouter.delete('/:id', async (req, res) => {
  const id = parseUuidParam(req.params.id);
  const tenantId = requireTenantId(req);
  if (!tenantId) {
    unauthenticated(res);
    return;
  }
  if (!id) {
    badRequest(res, 'INVALID_ID', 'Meeting id must be a UUID');
    return;
  }

  try {
    const result = await withTenant(tenantId, (client) =>
      client.query('DELETE FROM meetings WHERE id = $1', [id])
    );
    if (!result.rowCount) {
      notFound(res, 'Meeting not found');
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err, id }, 'Failed to delete meeting');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to delete meeting' } });
  }
});
