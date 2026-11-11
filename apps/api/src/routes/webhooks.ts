/**
 * Webhook routes
 * Stub implementation for scaffold - Svix verification in PR B
 */

import { Router } from 'express';
import { logger } from '../lib/logger.js';

export const webhooksRouter = Router();

/**
 * POST /webhooks/recall
 * Recall.ai webhook endpoint (stub - full implementation in PR B)
 */
webhooksRouter.post('/recall', async (req, res) => {
  // Always respond 200 immediately to prevent retries
  res.status(200).json({ received: true });

  const payload = req.body;
  logger.info({ event: payload.event }, 'Recall webhook received (stub)');

  // Full implementation with Svix verification in PR B
});
