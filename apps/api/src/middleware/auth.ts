import type { NextFunction, Request, Response } from 'express';
import { hasRequiredRole, type Role } from '@meeting-assistant/shared';
import { loadSession, readSessionToken, refreshIdleTtl, toMeResponse } from '../lib/session.js';
import { forbidden, seatInactive, unauthenticated } from '../lib/http-error.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(req.cookies);
    const ctx = await loadSession(token);
    if (!ctx) {
      unauthenticated(res);
      return;
    }
    const me = toMeResponse(ctx);
    if (!me) {
      if (ctx.memberships.length > 0) {
        seatInactive(res);
        return;
      }
      unauthenticated(res, 'No access: ask your admin');
      return;
    }
    if (token) {
      await refreshIdleTtl(token);
    }
    req.auth = { ...me, sessionId: ctx.session_id };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guard every /api/v1/* route except /api/v1/auth/*.
 */
export function v1AuthGuard(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0];
  if (!path.startsWith('/api/v1')) {
    next();
    return;
  }
  if (path === '/api/v1/auth' || path.startsWith('/api/v1/auth/')) {
    next();
    return;
  }
  void requireAuth(req, res, next);
}

export function requireRole(required: Role | Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role) {
      unauthenticated(res);
      return;
    }
    if (!hasRequiredRole(role, required)) {
      forbidden(res);
      return;
    }
    next();
  };
}
