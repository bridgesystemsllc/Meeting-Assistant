import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireRole, v1AuthGuard } from './auth.js';

vi.mock('../lib/session.js', () => ({
  loadSession: vi.fn(),
  readSessionToken: vi.fn(),
  refreshIdleTtl: vi.fn(),
  toMeResponse: vi.fn(),
}));

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('requireRole matrix', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it.each([
    ['owner', 'owner', true],
    ['owner', 'admin', true],
    ['owner', 'member', true],
    ['admin', 'owner', false],
    ['admin', 'admin', true],
    ['admin', 'member', true],
    ['member', 'owner', false],
    ['member', 'admin', false],
    ['member', 'member', true],
  ] as const)('%s calling requireRole(%s)', (actual, required, allowed) => {
    const req = { auth: { role: actual } } as Request;
    const res = mockRes();
    requireRole(required)(req, res, next);
    if (allowed) {
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    } else {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'FORBIDDEN', message: 'Insufficient role' },
      });
    }
  });
});

describe('v1AuthGuard', () => {
  it('skips /api/v1/auth/*', () => {
    const req = { originalUrl: '/api/v1/auth/login/google' } as Request;
    const res = mockRes();
    const next = vi.fn();
    v1AuthGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
