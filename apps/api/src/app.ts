/**
 * Express application factory. Listening is done in index.ts so tests can import the app.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { parse as parseCookie } from 'cookie';

import { healthRouter } from './routes/health.js';
import { meetingsRouter } from './routes/meetings.js';
import { webhooksRouter } from './routes/webhooks.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { tenantRouter } from './routes/tenant.js';
import { errorHandler } from './middleware/errors.js';
import { v1AuthGuard } from './middleware/auth.js';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(morgan('combined'));

  // P1-1: Mount webhooks BEFORE express.json() to allow raw body capture for signature verification
  // The webhooks router has its own body parsing middleware (express.raw)
  app.use('/webhooks', webhooksRouter);

  // Now mount JSON parser for all other routes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    req.cookies = parseCookie(req.headers.cookie ?? '');
    next();
  });

  app.use('/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use(v1AuthGuard);
  app.use('/api/v1/me', meRouter);
  app.use('/api/v1/tenant', tenantRouter);
  app.use('/api/v1/meetings', meetingsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}
