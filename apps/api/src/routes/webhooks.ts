/**
 * Webhook routes.
 * Full Svix verification lives in FORGE Phase 1 (PR #3). This PR wraps the
 * handler so tenant resolution happens through a SECURITY DEFINER lookup and
 * subsequent DB work runs under withTenant.
 *
 * FORGE must call:
 *   resolveMeetingTenant(...) → 400 TENANT_MISMATCH on claimed/stored mismatch
 *   webhookInsertEvent / webhookMarkProcessed (not SELECT/INSERT webhook_events)
 *   withTenant(resolved.tenant_id, ...) for every meeting row touch
 */

import { Router } from 'express';
import { withTenant } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { sendError } from '../lib/http-error.js';
import {
  parseRecallWebhookCorrelation,
  resolveMeetingTenant,
  webhookInsertEvent,
} from '../lib/tenant-lookup.js';

export const webhooksRouter = Router();

/**
 * POST /webhooks/recall
 * Resolve tenant, then run under withTenant. Signature verification is FORGE.
 */
webhooksRouter.post('/recall', async (req, res) => {
  const correlation = parseRecallWebhookCorrelation(req.body);

  if (correlation.recallBotId || correlation.claimedMeetingId) {
    const resolved = await resolveMeetingTenant({
      recallBotId: correlation.recallBotId,
      claimedTenantId: correlation.claimedTenantId,
      claimedMeetingId: correlation.claimedMeetingId,
    });

    if (!resolved.ok && resolved.code === 'TENANT_MISMATCH') {
      logger.warn(
        { botId: correlation.recallBotId, event: correlation.event },
        'Webhook tenant mismatch'
      );
      sendError(res, 400, 'TENANT_MISMATCH', 'Webhook tenant does not match meeting');
      return;
    }

    if (resolved.ok) {
      const eventId =
        (req.headers['svix-id'] as string | undefined) ||
        (req.headers['webhook-id'] as string | undefined) ||
        `${correlation.recallBotId ?? resolved.meeting_id}-${correlation.event ?? 'event'}`;

      if (correlation.recallBotId && correlation.event) {
        await webhookInsertEvent(
          correlation.recallBotId,
          correlation.event,
          eventId,
          req.body ?? {}
        );
      }

      await withTenant(resolved.tenant_id, async (client) => {
        await client.query('SELECT id FROM meetings WHERE id = $1', [resolved.meeting_id]);
      });
    }
  }

  res.status(200).json({ received: true });
});
