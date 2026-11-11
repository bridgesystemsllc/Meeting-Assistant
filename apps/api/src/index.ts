/**
 * [PRODUCT NAME] API Server
 * Main entry point for the Express API
 */

import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { assertConnectedAppRole } from './lib/app-role.js';
import { assertApiRuntimeEnv } from './lib/runtime-env.js';
import { purgeExpiredAuthRows } from './lib/auth-db.js';
import { requireWebhookSecret } from './services/webhook-verify.js';

if (process.env.NODE_ENV !== 'test') {
  try {
    assertApiRuntimeEnv();
    if (process.env.NODE_ENV === 'production') {
      requireWebhookSecret();
    }
    await assertConnectedAppRole();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

const app = createApp();
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV }, 'API server started');
  });
  setInterval(() => {
    void purgeExpiredAuthRows().catch((err) => {
      logger.warn({ err: (err as Error).name }, 'auth purge failed');
    });
  }, 15 * 60 * 1000).unref();
}

export { app };
