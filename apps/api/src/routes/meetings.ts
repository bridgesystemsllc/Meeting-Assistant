/**
 * Meetings API routes.
 * Every handler runs DB work under withTenant(session tenant) and filters
 * tenant_id in SQL (defense in depth with FORCE RLS).
 * Cross-tenant ids return 404, never 403 (spec §5.7 / P0-3).
 *
 * FORGE Phase 1 POST /api/v1/meetings (Recall bot create) must keep this
 * withTenant wrapping and must set tenant_id from the session, not the body.
 */

import { Router } from 'express';
import { hasRequiredRole } from '@meeting-assistant/shared';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { forbidden, notFound, unauthenticated } from '../lib/http-error.js';
import { recordAudit } from '../lib/audit.js';

export const meetingsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
         LEFT JOIN meeting_analysis ma
           ON ma.meeting_id = m.id AND ma.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, parseInt(limit as string, 10), parseInt(offset as string, 10)]
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
  const { id } = req.params;
  const tenantId = requireTenantId(req);
  if (!tenantId) {
    unauthenticated(res);
    return;
  }
  if (!UUID_RE.test(id)) {
    notFound(res, 'Meeting not found');
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
        client.query('SELECT * FROM transcripts WHERE meeting_id = $1 AND tenant_id = $2', [
          id,
          tenantId,
        ]),
        client.query('SELECT * FROM meeting_analysis WHERE meeting_id = $1 AND tenant_id = $2', [
          id,
          tenantId,
        ]),
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
 * Cross-tenant → 404. Same-tenant member who is not admin/owner and not the
 * meeting owner → 403. Audit stub is P2-4's drop-in.
 */
meetingsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = requireTenantId(req);
  const actor = req.auth;
  if (!tenantId || !actor) {
    unauthenticated(res);
    return;
  }
  if (!UUID_RE.test(id)) {
    notFound(res, 'Meeting not found');
    return;
  }

  try {
    const deleted = await withTenant(tenantId, async (client) => {
      const existing = await client.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM meetings WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
      );
      if (existing.rowCount === 0) {
        return 'missing' as const;
      }
      const meetingOwner = existing.rows[0].user_id === actor.user.id;
      const privileged = hasRequiredRole(actor.role, 'admin');
      if (!privileged && !meetingOwner) {
        return 'forbidden' as const;
      }
      await client.query('DELETE FROM meetings WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      return 'deleted' as const;
    });

    if (deleted === 'missing') {
      notFound(res, 'Meeting not found');
      return;
    }
    if (deleted === 'forbidden') {
      forbidden(res);
      return;
    }

    await recordAudit({
      tenantId,
      actorUserId: actor.user.id,
      action: 'meeting.delete',
      target: id,
    });
    res.status(204).send();
  } catch (err) {
    logger.error({ err, id }, 'Failed to delete meeting');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to delete meeting' } });
  }
});
