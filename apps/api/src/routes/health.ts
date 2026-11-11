/**
 * Health check endpoints
 * P0-1: /health returns 200 with DB and Redis reported ok
 */

import { Router } from 'express';
import { db } from '../lib/db.js';
import { redisHealthCheck } from '../lib/redis.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  service: string;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    db.healthCheck(),
    redisHealthCheck(),
  ]);

  const allOk = dbOk && redisOk;
  
  const response: HealthResponse = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'meeting-assistant-api',
    checks: {
      database: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
  };

  res.status(allOk ? 200 : 503).json(response);
});

healthRouter.get('/ready', async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    db.healthCheck(),
    redisHealthCheck(),
  ]);

  if (dbOk && redisOk) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});
