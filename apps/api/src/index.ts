/**
 * [PRODUCT NAME] API Server
 * Main entry point for the Express API
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { healthRouter } from './routes/health.js';
import { meetingsRouter } from './routes/meetings.js';
import { webhooksRouter } from './routes/webhooks.js';
import { errorHandler } from './middleware/errors.js';
import { logger } from './lib/logger.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);
app.use('/api/meetings', meetingsRouter);
app.use('/webhooks', webhooksRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'API server started');
});

export { app };
