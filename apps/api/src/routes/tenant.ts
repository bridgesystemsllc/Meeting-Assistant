/**
 * Tenant / seats routes.
 * P2-3 (#8) fills in invite and seat handlers. This PR only mounts the
 * active-membership guard so deactivated members get 403 SEAT_INACTIVE.
 * #8's `requireActiveSeat` from `lib/seats.ts` supersedes the same export.
 */

import { Router } from 'express';
import { requireActiveSeat } from '../lib/seats.js';

export const tenantRouter = Router();

tenantRouter.use(requireActiveSeat);
