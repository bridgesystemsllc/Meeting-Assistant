/**
 * Seat / invite types shared by API and web.
 * Schema changes go through this module plus db/migrations.
 */

import { z } from 'zod';
import { RoleSchema, SeatStatusSchema } from './auth.js';

export const InviteRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  role: RoleSchema.default('member'),
});
export type InviteRequest = z.infer<typeof InviteRequestSchema>;

export const SeatMemberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: RoleSchema,
  seat_status: SeatStatusSchema,
  last_active: z.string().nullable(),
});
export type SeatMember = z.infer<typeof SeatMemberSchema>;

export const PendingInviteSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
  expires_at: z.string(),
  created_at: z.string(),
});
export type PendingInvite = z.infer<typeof PendingInviteSchema>;

export const SeatUsageSchema = z.object({
  seat_limit: z.number().int().min(1),
  seats_used: z.number().int().min(0),
});
export type SeatUsage = z.infer<typeof SeatUsageSchema>;

/** GET/POST /api/v1/tenant/seats* */
export const SeatsResponseSchema = SeatUsageSchema.extend({
  members: z.array(SeatMemberSchema),
  invites: z.array(PendingInviteSchema),
});
export type SeatsResponse = z.infer<typeof SeatsResponseSchema>;

export const PublicInviteSchema = z.object({
  email: z.string().email(),
  role: RoleSchema,
  expires_at: z.string(),
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
});
export type PublicInvite = z.infer<typeof PublicInviteSchema>;

/** seats_used never includes deactivated members. */
export function countSeatsUsed(params: {
  membershipSeats: number;
  extraPendingInvites: number;
}): number {
  return params.membershipSeats + params.extraPendingInvites;
}

/** True when adding `additional` seats would exceed `seat_limit`. */
export function seatLimitReached(
  seatsUsed: number,
  seatLimit: number,
  additional = 1
): boolean {
  return seatsUsed + additional > seatLimit;
}
