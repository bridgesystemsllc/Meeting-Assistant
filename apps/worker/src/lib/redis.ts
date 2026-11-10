/**
 * Redis connection for BullMQ
 */

import Redis from 'ioredis';
import { logger } from './logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis.default(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});
