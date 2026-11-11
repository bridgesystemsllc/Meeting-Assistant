import { Router } from 'express';
import { MeResponseSchema } from '@meeting-assistant/shared';
import { unauthenticated } from '../lib/http-error.js';
import { getSeatUsage } from '../services/seats.js';

export const meRouter = Router();

meRouter.get('/', async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const seats = await getSeatUsage(req.auth.tenant.id);
    const body = MeResponseSchema.parse({
      user: req.auth.user,
      tenant: req.auth.tenant,
      role: req.auth.role,
      seat_status: req.auth.seat_status,
      memberships: req.auth.memberships,
      seats,
    });
    res.json(body);
  } catch (err) {
    next(err);
  }
});
