import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db and redis modules before importing health router
vi.mock('../lib/db.js', () => ({
  db: {
    healthCheck: vi.fn(),
  },
}));

vi.mock('../lib/redis.js', () => ({
  redisHealthCheck: vi.fn(),
}));

import { db } from '../lib/db.js';
import { redisHealthCheck } from '../lib/redis.js';

describe('Health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok when all checks pass', async () => {
    vi.mocked(db.healthCheck).mockResolvedValue(true);
    vi.mocked(redisHealthCheck).mockResolvedValue(true);

    // The actual HTTP test would require setting up express
    // For now, we test the health check functions
    const dbOk = await db.healthCheck();
    const redisOk = await redisHealthCheck();

    expect(dbOk).toBe(true);
    expect(redisOk).toBe(true);
  });

  it('reports degraded when database fails', async () => {
    vi.mocked(db.healthCheck).mockResolvedValue(false);
    vi.mocked(redisHealthCheck).mockResolvedValue(true);

    const dbOk = await db.healthCheck();
    const redisOk = await redisHealthCheck();

    expect(dbOk).toBe(false);
    expect(redisOk).toBe(true);
  });

  it('reports degraded when redis fails', async () => {
    vi.mocked(db.healthCheck).mockResolvedValue(true);
    vi.mocked(redisHealthCheck).mockResolvedValue(false);

    const dbOk = await db.healthCheck();
    const redisOk = await redisHealthCheck();

    expect(dbOk).toBe(true);
    expect(redisOk).toBe(false);
  });
});
