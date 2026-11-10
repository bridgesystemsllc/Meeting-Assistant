import { getAppPool } from './db.js';
import { RuntimeConfigError } from './runtime-env.js';

/**
 * Fail closed unless APP_DATABASE_URL is the restricted app role:
 * NOSUPERUSER, NOBYPASSRLS, owns no public relations, and is not granted
 * definer_access / any USING (true) policy (those belong to the table owner).
 */
export const APP_ROLE_GUARD_SQL = `
SELECT
  r.rolsuper,
  r.rolbypassrls,
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relowner = r.oid
  ) AS owns_public_relation,
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        p.polname IN ('definer_access', 'auth_definer')
        OR p.polqual IS NULL
        OR regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[()[:space:]]', '', 'g') = 'true'
      )
      AND (r.oid = ANY (p.polroles) OR 0 = ANY (p.polroles))
  ) AS has_unrestricted_rls_policy
FROM pg_roles r
WHERE r.rolname = current_user
`;

export interface RoleAttrs {
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export interface AppRoleGuardRow extends RoleAttrs {
  owns_public_relation: boolean;
  has_unrestricted_rls_policy: boolean;
}

/** Fail closed unless the connected role is NOSUPERUSER and NOBYPASSRLS. */
export function assertNosuperuserNobypassrls(
  row: RoleAttrs | undefined,
  roleLabel = 'connected database role'
): void {
  if (!row) {
    throw new RuntimeConfigError(`${roleLabel} is missing from pg_roles`);
  }
  if (row.rolsuper || row.rolbypassrls) {
    throw new RuntimeConfigError(
      `${roleLabel} must be NOSUPERUSER and NOBYPASSRLS (rolsuper=${String(row.rolsuper)} rolbypassrls=${String(row.rolbypassrls)})`
    );
  }
}

/** Fail closed unless APP_DATABASE_URL is the restricted app role, not a table owner. */
export function assertRestrictedAppRole(
  row: AppRoleGuardRow | undefined,
  roleLabel = 'connected database role'
): void {
  assertNosuperuserNobypassrls(row, roleLabel);
  if (!row) {
    return;
  }
  if (row.owns_public_relation) {
    throw new RuntimeConfigError(
      `${roleLabel} must be meeting_assistant_app; it owns relations in public`
    );
  }
  if (row.has_unrestricted_rls_policy) {
    throw new RuntimeConfigError(
      `${roleLabel} must be meeting_assistant_app; it is granted definer_access or a USING (true) policy`
    );
  }
}

export async function assertConnectedAppRole(): Promise<void> {
  const result = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
  assertRestrictedAppRole(result.rows[0]);
}
