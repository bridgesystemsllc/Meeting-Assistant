/**
 * Meetings API routes.
 * Every handler runs DB work under withTenant(session tenant) and filters
 * tenant_id in SQL (defense in depth with FORCE RLS).
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
import { z } from 'zod';
import { hasRequiredRole } from '@meeting-assistant/shared';
import { recordAudit } from '../lib/audit.js';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { badRequest, forbidden, notFound, sendError, unauthenticated } from '../lib/http-error.js';
import { requireActiveSeat } from '../lib/seats.js';

export const meetingsRouter = Router();

meetingsRouter.use(requireActiveSeat);

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
         LEFT JOIN meeting_analysis ma
           ON ma.meeting_id = m.id AND ma.tenant_id = m.tenant_id
         WHERE m.tenant_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, page.limit, page.offset]
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
    sendError(res, 500, 'INTERNAL', 'Failed to fetch meeting');
  }
});

/**
 * POST /api/v1/meetings
 * P1-6: Create a meeting and dispatch a Recall bot to join.
 * The bot is created via Recall API and tracked by recall_bot_id.
 */
meetingsRouter.post('/', async (req, res) => {
  const tenantId = req.auth?.tenant.id;
  if (!tenantId) {
    unauthenticated(res);
    return;
  }

  const { meeting_url, title, platform } = req.body;

  if (!meeting_url) {
    res.status(400).json({ error: { code: 'MISSING_FIELD', message: 'meeting_url is required' } });
    return;
  }

  const userId = req.auth?.user.id;
  if (!userId) {
    unauthenticated(res);
    return;
  }

  try {
    // Import recall service dynamically to support mocking in tests
    const { recallService } = await import('../services/recall.js');
    
    // Create meeting record first
    const meeting = await withTenant(tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        title: string;
        platform: string;
        status: string;
      }>(
        `INSERT INTO meetings (tenant_id, user_id, title, platform, meeting_url, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id, title, platform, status`,
        [tenantId, userId, title || 'Untitled Meeting', platform || detectPlatform(meeting_url), meeting_url]
      );
      return result.rows[0];
    });

    // Create and send Recall bot
    const botName = process.env.BOT_NAME || 'Meeting Assistant';
    const bot = await recallService.createBot({
      meetingUrl: meeting_url,
      botName,
      meetingId: meeting.id,
      tenantId,
    });

    // Update meeting with bot ID
    await withTenant(tenantId, (client) =>
      client.query(
        `UPDATE meetings SET recall_bot_id = $1, status = 'joining', updated_at = NOW() WHERE id = $2`,
        [bot.id, meeting.id]
      )
    );

    logger.info({ meetingId: meeting.id, botId: bot.id }, 'Meeting created with bot dispatched');

    res.status(201).json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        platform: meeting.platform,
        status: 'joining',
        recall_bot_id: bot.id,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to create meeting');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create meeting' } });
  }
});

function detectPlatform(url: string): string {
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
  if (url.includes('meet.google.com')) return 'meet';
  if (url.includes('webex.com')) return 'webex';
  return 'unknown';
}

/**
 * DELETE /api/v1/meetings/:id
 * Cross-tenant → 404. Same-tenant member who is not admin/owner and not the
 * meeting owner → 403. 204 and meeting.deleted only when DELETE rowCount is 1;
 * concurrent authorized deletes yield one 204 and the rest 404. Audit and
 * delete share the withTenant txn so an audit failure rolls the row back.
 */
meetingsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.auth?.tenant.id;
  const actor = req.auth;
  if (!tenantId || !actor) {
    unauthenticated(res);
    return;
  }
  if (!UuidSchema.safeParse(id).success) {
    badRequest(res, 'INVALID_ID', 'Meeting id must be a UUID');
    return;
  }

  try {
    const deleted = await withTenant(tenantId, async (client) => {
      const existing = await client.query<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM meetings WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
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
      const removed = await client.query('DELETE FROM meetings WHERE id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
      if (!removed.rowCount) {
        return 'missing' as const;
      }
      await recordAudit(client, {
        actorUserId: actor.user.id,
        action: 'meeting.deleted',
        targetType: 'meeting',
        targetId: id,
      });
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

    res.status(204).send();
  } catch (err) {
    logger.error({ err, id }, 'Failed to delete meeting');
    sendError(res, 500, 'INTERNAL', 'Failed to delete meeting');
  }
});
