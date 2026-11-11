/**
 * Audit log types shared by API and web.
 * Schema changes go through this module plus db/migrations.
 *
 * member.role_changed is reserved (no role-change route in this PR).
 * branding.updated and meeting.bot_dispatched are reserved for later
 * phases (white-label PUT and Recall bot dispatch). Call recordAudit
 * with those actions when those routes land.
 */

import { z } from 'zod';

export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'failed-login',
  'failed-invite',
  'invite.sent',
  'invite.resent',
  'invite.revoked',
  'invite.accepted',
  'member.deactivated',
  'member.reactivated',
  'member.role_changed',
  'branding.updated',
  'meeting.bot_dispatched',
  'meeting.deleted',
] as const;

export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  'failed-login': 'Sign-in failed',
  'failed-invite': 'Invite failed',
  'invite.sent': 'Invite sent',
  'invite.resent': 'Invite resent',
  'invite.revoked': 'Invite revoked',
  'invite.accepted': 'Invite accepted',
  'member.deactivated': 'Member deactivated',
  'member.reactivated': 'Member reactivated',
  'member.role_changed': 'Role changed',
  'branding.updated': 'Branding updated',
  'meeting.bot_dispatched': 'Meeting bot dispatched',
  'meeting.deleted': 'Meeting deleted',
};

const SECRET_KEY = /token|secret|password|authorization|cookie|credential|verifier|api[_-]?key|(^|_)hash$/i;

/**
 * Mask an invitee email as a***@domain. Used in the activity feed so the
 * raw address is never stored or rendered after HMAC.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return '***';
  return `${trimmed.charAt(0)}***@${trimmed.slice(at + 1)}`;
}

/**
 * Drop secrets/tokens from metadata. Raw invitee email is stripped by
 * recordAudit (HMAC + masked columns) before insert.
 */
export function sanitizeAuditMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SECRET_KEY.test(key)) continue;
    if (key === 'email') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
      continue;
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

export const AuditActorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().email(),
});
export type AuditActor = z.infer<typeof AuditActorSchema>;

export const ActivityItemSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  action: AuditActionSchema,
  actor: AuditActorSchema.nullable(),
  target_type: z.string().nullable(),
  target_id: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

/** GET /api/v1/tenant/activity */
export const ActivityListResponseSchema = z.object({
  items: z.array(ActivityItemSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityListResponse = z.infer<typeof ActivityListResponseSchema>;

export const ActivityQuerySchema = z.object({
  limit: z.preprocess(
    (value) => (value === undefined || value === '' ? 20 : value),
    z.coerce
      .number()
      .int()
      .transform((n) => Math.min(100, Math.max(1, n)))
  ),
  cursor: z.string().min(1).optional(),
  action: AuditActionSchema.optional(),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
