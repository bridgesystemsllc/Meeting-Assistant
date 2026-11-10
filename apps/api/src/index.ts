/**
 * [PRODUCT NAME] API Server
 * Main entry point for the Express API
 */

import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { requireWebhookSecret } from './services/webhook-verify.js';

if (process.env.NODE_ENV === 'production') {
  requireWebhookSecret();
}

const app = createApp();
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'API server started');
  });
}

export { app };
