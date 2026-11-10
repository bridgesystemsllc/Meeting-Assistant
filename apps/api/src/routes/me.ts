import { Router } from 'express';
import { MeResponseSchema } from '@meeting-assistant/shared';
import { unauthenticated } from '../lib/http-error.js';

export const meRouter = Router();

meRouter.get('/', (req, res) => {
  if (!req.auth) {
    unauthenticated(res);
    return;
  }
  const body = MeResponseSchema.parse({
    user: req.auth.user,
    tenant: req.auth.tenant,
    role: req.auth.role,
    seat_status: req.auth.seat_status,
    memberships: req.auth.memberships,
  });
  res.json(body);
});
