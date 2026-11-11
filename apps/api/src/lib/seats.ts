/**
 * Seat guard for authenticated requests.
 *
 * FORGE Phase 1 (PR #3) bot-dispatch: before creating a Recall bot on
 * POST /api/v1/meetings, call `assertActiveSeat(req.auth)`. This router
 * already runs `requireActiveSeat` for every meetings handler, so a new
 * POST on `meetingsRouter` inherits the check. If Phase 1 registers POST
 * on a different router, invoke `assertActiveSeat` (or this middleware)
 * before `createBot`.
 */

import type { NextFunction, Request, Response } from 'express';
import type { MeResponse } from '@meeting-assistant/shared';
import { HttpError, sendError, unauthenticated } from './http-error.js';

export function assertActiveSeat(auth: MeResponse): void {
  const membership = auth.memberships.find((m) => m.tenant.id === auth.tenant.id);
  const status = membership?.seat_status ?? auth.seat_status;
  if (!membership || status !== 'active') {
    throw new HttpError(403, 'SEAT_INACTIVE', 'Your seat is inactive. Ask your admin.');
  }
}

export function requireActiveSeat(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    unauthenticated(res);
    return;
  }
  try {
    assertActiveSeat(req.auth);
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      sendError(res, err.statusCode, err.code, err.message);
      return;
    }
    next(err);
  }
}
