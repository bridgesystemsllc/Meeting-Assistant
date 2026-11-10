/**
 * Tenant vs global table classification.
 * Schema changes go through this module plus db/migrations.
 *
 * ATLAS Q4: these global tables are exempt from tenant_id. The app role is
 * denied direct access; lookups go through narrow SECURITY DEFINER functions.
 */

export const GLOBAL_TABLES = [
  'tenants',
  'users',
  'webhook_events',
  'sessions',
  'oidc_login_state',
] as const;

export type GlobalTable = (typeof GLOBAL_TABLES)[number];

export const GLOBAL_TABLE_SET: ReadonlySet<string> = new Set(GLOBAL_TABLES);

export function isGlobalTable(name: string): boolean {
  return GLOBAL_TABLE_SET.has(name);
}

/**
 * Tenant-owned tables known at P2-2. The CI meta-test is dynamic (every
 * public table not in GLOBAL_TABLES), so a new table still fails CI even if
 * it is missing from this list.
 */
export const TENANT_TABLES = [
  'meetings',
  'transcripts',
  'meeting_analysis',
  'email_deliveries',
  'tenant_settings',
  'memberships',
  'invites',
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

export const TenantErrorCodeSchema = {
  NOT_FOUND: 'NOT_FOUND',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  TENANT_REQUIRED: 'TENANT_REQUIRED',
} as const;

export type TenantErrorCode = (typeof TenantErrorCodeSchema)[keyof typeof TenantErrorCodeSchema];
