import { Router } from 'express';
import { hasRequiredRole, InviteRequestSchema } from '@meeting-assistant/shared';
import { badRequest, parseUuidParam, sendError, unauthenticated } from '../lib/http-error.js';
import { requireRole } from '../middleware/auth.js';
import { requireActiveSeat } from '../lib/seats.js';
import {
  deactivateMember,
  getSeats,
  inviteMember,
  reactivateMember,
  resendInvite,
  revokeInvite,
} from '../services/seats.js';

export const tenantRouter = Router();

tenantRouter.use(requireActiveSeat);

function requireUuid(res: Parameters<typeof badRequest>[0], value: string | string[] | undefined, label: string): string | null {
  const id = parseUuidParam(value);
  if (!id) {
    badRequest(res, 'INVALID_ID', `${label} must be a UUID`);
    return null;
  }
  return id;
}

tenantRouter.get('/seats', async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const includeDirectory = hasRequiredRole(req.auth.role, 'admin');
    res.json(await getSeats(req.auth, includeDirectory));
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/seats/invite', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const parsed = InviteRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'A valid email and role are required');
      return;
    }
    const seats = await inviteMember(req.auth, parsed.data);
    res.status(201).json(seats);
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/seats/invites/:inviteId/resend', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const inviteId = requireUuid(res, req.params.inviteId, 'Invite id');
    if (!inviteId) return;
    res.json(await resendInvite(req.auth, inviteId));
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/seats/invites/:inviteId/revoke', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const inviteId = requireUuid(res, req.params.inviteId, 'Invite id');
    if (!inviteId) return;
    res.json(await revokeInvite(req.auth, inviteId));
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/seats/:membershipId/deactivate', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const membershipId = requireUuid(res, req.params.membershipId, 'Membership id');
    if (!membershipId) return;
    res.json(await deactivateMember(req.auth, membershipId));
  } catch (err) {
    next(err);
  }
});

tenantRouter.post('/seats/:membershipId/reactivate', requireRole('admin'), async (req, res, next) => {
  try {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    const membershipId = requireUuid(res, req.params.membershipId, 'Membership id');
    if (!membershipId) return;
    res.json(await reactivateMember(req.auth, membershipId));
  } catch (err) {
    next(err);
  }
});
