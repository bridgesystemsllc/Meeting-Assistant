/**
 * Consent Routes
 * API endpoints for consent settings and status
 */

import { Router, Request, Response } from 'express';
import pg from 'pg';
import { logger } from '../lib/logger.js';
import {
  getConsentSettings,
  validateBotName,
  getBotDisplayName,
  getPreJoinNotice,
  getInCallNotice,
  getStopKeywords,
} from '../services/consent.js';

const router = Router();

/**
 * Get consent settings for current tenant
 * GET /api/consent/settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Missing tenant ID' });
    }

    const pool = req.app.get('db') as pg.Pool;
    const settings = await getConsentSettings(pool, tenantId);

    res.json({
      botDisplayName: getBotDisplayName(settings),
      preJoinNotice: getPreJoinNotice(settings),
      inCallNotice: getInCallNotice(settings),
      stopKeywords: getStopKeywords(settings),
      hasCustomSettings: settings !== null,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get consent settings');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Update consent settings for current tenant
 * PUT /api/consent/settings
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) {
      return res.status(400).json({ error: 'Missing tenant ID' });
    }

    const { botDisplayName, preJoinNotice, inCallNotice, stopKeywords } = req.body;

    // Validate bot name if provided
    if (botDisplayName) {
      const validation = validateBotName(botDisplayName);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    // Validate stop keywords if provided
    if (stopKeywords && !Array.isArray(stopKeywords)) {
      return res.status(400).json({ error: 'stopKeywords must be an array' });
    }

    const pool = req.app.get('db') as pg.Pool;

    await pool.query(
      `INSERT INTO tenant_settings (tenant_id, bot_display_name, pre_join_notice, in_call_notice, stop_keywords)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id) 
       DO UPDATE SET 
         bot_display_name = COALESCE($2, tenant_settings.bot_display_name),
         pre_join_notice = COALESCE($3, tenant_settings.pre_join_notice),
         in_call_notice = COALESCE($4, tenant_settings.in_call_notice),
         stop_keywords = COALESCE($5, tenant_settings.stop_keywords),
         updated_at = NOW()`,
      [tenantId, botDisplayName || null, preJoinNotice || null, inCallNotice || null, stopKeywords || null]
    );

    logger.info({ tenantId }, 'Consent settings updated');

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to update consent settings');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get consent status for a meeting
 * GET /api/consent/meeting/:meetingId
 */
router.get('/meeting/:meetingId', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({ error: 'Missing tenant ID' });
    }

    const pool = req.app.get('db') as pg.Pool;

    const result = await pool.query<{
      consent_status: string;
      consent_denied_at: Date | null;
      consent_denied_reason: string | null;
    }>(
      `SELECT consent_status, consent_denied_at, consent_denied_reason
       FROM meetings
       WHERE id = $1 AND tenant_id = $2`,
      [meetingId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = result.rows[0];

    // Get consent events for this meeting
    const eventsResult = await pool.query<{
      id: string;
      event_type: string;
      event_source: string | null;
      actor_name: string | null;
      created_at: Date;
    }>(
      `SELECT id, event_type, event_source, actor_name, created_at
       FROM consent_events
       WHERE meeting_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [meetingId, tenantId]
    );

    res.json({
      status: meeting.consent_status,
      deniedAt: meeting.consent_denied_at,
      deniedReason: meeting.consent_denied_reason,
      events: eventsResult.rows.map(e => ({
        id: e.id,
        eventType: e.event_type,
        eventSource: e.event_source,
        actorName: e.actor_name,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get consent status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Validate a proposed bot name
 * POST /api/consent/validate-bot-name
 */
router.post('/validate-bot-name', (req: Request, res: Response) => {
  const { botName } = req.body;

  if (!botName || typeof botName !== 'string') {
    return res.status(400).json({ error: 'botName is required' });
  }

  const validation = validateBotName(botName);
  res.json(validation);
});

export default router;
