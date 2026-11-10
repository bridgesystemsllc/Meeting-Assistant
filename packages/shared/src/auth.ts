/**
 * Auth, membership, and session types shared by API and web.
 * Schema changes for these entities go through this module plus db/migrations.
 */

import { z } from 'zod';

export const RoleSchema = z.enum(['owner', 'admin', 'member']);
export type Role = z.infer<typeof RoleSchema>;

export const SeatStatusSchema = z.enum(['invited', 'active', 'deactivated']);
export type SeatStatus = z.infer<typeof SeatStatusSchema>;

export const BillingStatusSchema = z.enum(['pilot', 'active', 'past_due', 'canceled']);
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

export const OidcProviderSchema = z.enum(['google', 'microsoft']);
export type OidcProvider = z.infer<typeof OidcProviderSchema>;

/**
 * Auth / authorization error codes. HTTP mapping:
 * UNAUTHENTICATED → 401, FORBIDDEN → 403, others as documented.
 */
export const AuthErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NO_MEMBERSHIP',
  'INVALID_STATE',
  'INVALID_NONCE',
  'INVALID_PKCE',
  'INVALID_ISSUER',
  'INVALID_INVITE',
  'INVITE_EMAIL_MISMATCH',
  'EMAIL_UNVERIFIED',
  'OIDC_FAILED',
  'SEAT_INACTIVE',
  'SEAT_LIMIT_REACHED',
]);
export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;

export const ROLE_RANK: Record<Role, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * True when `actual` meets or exceeds `required`.
 * `requireRole('admin')` allows owner and admin.
 */
export function hasRequiredRole(actual: Role, required: Role | Role[]): boolean {
  if (Array.isArray(required)) {
    return required.includes(actual);
  }
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const PublicTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type PublicTenant = z.infer<typeof PublicTenantSchema>;

export const MembershipViewSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  seat_status: SeatStatusSchema,
  tenant: PublicTenantSchema,
});
export type MembershipView = z.infer<typeof MembershipViewSchema>;

/** GET /api/v1/me */
export const MeResponseSchema = z.object({
  user: PublicUserSchema,
  tenant: PublicTenantSchema,
  role: RoleSchema,
  seat_status: SeatStatusSchema,
  memberships: z.array(MembershipViewSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
