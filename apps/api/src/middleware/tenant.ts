import type { NextFunction, Request, Response } from 'express';
import { withTenant } from '../lib/db.js';
import { unauthenticated } from '../lib/http-error.js';

/**
 * Bind the request to the session tenant for the rest of the handler via withTenant.
 * Route handlers that need a client should call withTenant themselves; this
 * middleware only asserts that auth resolved a tenant.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.tenant.id) {
    unauthenticated(res);
    return;
  }
  next();
}

export { withTenant };
