/**
 * Consent settings and meeting-status routes.
 * Mounted at /api/v1/consent behind the existing v1 session auth guard.
 * Every DB touch runs under withTenant(session tenant).
 */

import { Router } from 'express';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  badRequest,
  notFound,
  parseUuidParam,
  unauthenticated,
} from '../lib/http-error.js';
import { requireActiveSeat } from '../lib/seats.js';
import {
  getBotDisplayName,
  getConsentSettings,
  getInCallNotice,
  getPreJoinNotice,
  getStopKeywords,
  validateBotName,
} from '../services/consent.js';

export const consentRouter = Router();

consentRouter.use(requireActiveSeat);

consentRouter.get('/settings', async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenant.id;
    if (!tenantId) {
      unauthenticated(res);
      return;
    }

    const settings = await withTenant(tenantId, (client) => getConsentSettings(client, tenantId));
    res.json({
      botDisplayName: getBotDisplayName(settings),
      preJoinNotice: getPreJoinNotice(settings),
      inCallNotice: getInCallNotice(settings),
      stopKeywords: getStopKeywords(settings),
      hasCustomSettings: settings !== null,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get consent settings');
    next(err);
  }
});

consentRouter.put('/settings', async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenant.id;
    if (!tenantId) {
      unauthenticated(res);
      return;
    }

    const { botDisplayName, preJoinNotice, inCallNotice, stopKeywords } = req.body ?? {};

    if (botDisplayName) {
      if (typeof botDisplayName !== 'string') {
        badRequest(res, 'VALIDATION_ERROR', 'botDisplayName must be a string');
        return;
      }
      const validation = validateBotName(botDisplayName);
      if (!validation.valid) {
        badRequest(res, 'VALIDATION_ERROR', validation.error || 'Invalid bot name');
        return;
      }
    }

    if (stopKeywords != null && !Array.isArray(stopKeywords)) {
      badRequest(res, 'VALIDATION_ERROR', 'stopKeywords must be an array');
      return;
    }
    if (Array.isArray(stopKeywords) && stopKeywords.some((k) => typeof k !== 'string')) {
      badRequest(res, 'VALIDATION_ERROR', 'stopKeywords must be an array of strings');
      return;
    }

    await withTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO tenant_settings (tenant_id, bot_display_name, pre_join_notice, in_call_notice, stop_keywords)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           bot_display_name = COALESCE($2, tenant_settings.bot_display_name),
           pre_join_notice = COALESCE($3, tenant_settings.pre_join_notice),
           in_call_notice = COALESCE($4, tenant_settings.in_call_notice),
           stop_keywords = COALESCE($5, tenant_settings.stop_keywords),
           updated_at = NOW()`,
        [
          tenantId,
          typeof botDisplayName === 'string' && botDisplayName.length > 0 ? botDisplayName : null,
          typeof preJoinNotice === 'string' ? preJoinNotice : null,
          typeof inCallNotice === 'string' ? inCallNotice : null,
          Array.isArray(stopKeywords) ? stopKeywords : null,
        ]
      )
    );

    logger.info({ tenantId }, 'Consent settings updated');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to update consent settings');
    next(err);
  }
});

consentRouter.get('/meetings/:meetingId', async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenant.id;
    if (!tenantId) {
      unauthenticated(res);
      return;
    }

    const meetingId = parseUuidParam(req.params.meetingId);
    if (!meetingId) {
      badRequest(res, 'INVALID_ID', 'meetingId must be a UUID');
      return;
    }

    const payload = await withTenant(tenantId, async (client) => {
      const result = await client.query<{
        consent_status: string;
        consent_denied_at: Date | null;
        consent_denied_reason: string | null;
      }>(
        `SELECT consent_status, consent_denied_at, consent_denied_reason
         FROM meetings
         WHERE id = $1 AND tenant_id = $2`,
        [meetingId, tenantId]
      );
      if (result.rows.length === 0) return null;

      const meeting = result.rows[0];
      const eventsResult = await client.query<{
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

      return {
        status: meeting.consent_status,
        deniedAt: meeting.consent_denied_at,
        deniedReason: meeting.consent_denied_reason,
        events: eventsResult.rows.map((event) => ({
          id: event.id,
          eventType: event.event_type,
          eventSource: event.event_source,
          actorName: event.actor_name,
          createdAt: event.created_at,
        })),
      };
    });

    if (!payload) {
      notFound(res, 'Meeting not found');
      return;
    }
    res.json(payload);
  } catch (err) {
    logger.error({ err }, 'Failed to get consent status');
    next(err);
  }
});

consentRouter.post('/validate-bot-name', (req, res) => {
  if (!req.auth?.tenant.id) {
    unauthenticated(res);
    return;
  }

  const { botName } = req.body ?? {};
  if (!botName || typeof botName !== 'string') {
    badRequest(res, 'VALIDATION_ERROR', 'botName is required');
    return;
  }

  res.json(validateBotName(botName));
});
