import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { MeResponse } from '@meeting-assistant/shared';
import { assertActiveSeat, requireActiveSeat } from './seats.js';
import { HttpError } from './http-error.js';

const tenant = { id: '00000000-0000-0000-0000-000000000010', name: 'Acme Notes', slug: 'acme-notes' };

function me(seat_status: MeResponse['seat_status']): MeResponse {
  return {
    user: { id: '00000000-0000-0000-0000-000000000013', email: 'member@example.com', name: 'Morgan Member' },
    tenant,
    role: 'member',
    seat_status,
    memberships: [
      {
        id: '00000000-0000-0000-0000-000000000024',
        role: 'member',
        seat_status,
        tenant,
      },
    ],
  };
}

describe('assertActiveSeat', () => {
  it('allows an active seat', () => {
    expect(() => assertActiveSeat(me('active'))).not.toThrow();
  });

  it('rejects invited-not-accepted and deactivated with SEAT_INACTIVE', () => {
    for (const status of ['invited', 'deactivated'] as const) {
      try {
        assertActiveSeat(me(status));
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).statusCode).toBe(403);
        expect((err as HttpError).code).toBe('SEAT_INACTIVE');
      }
    }
  });
});

describe('requireActiveSeat', () => {
  it('returns 403 SEAT_INACTIVE for an invited user', () => {
    const req = { auth: me('invited') } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
    const next = vi.fn() as NextFunction;
    requireActiveSeat(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'SEAT_INACTIVE', message: 'Your seat is inactive. Ask your admin.' },
    });
  });
});
