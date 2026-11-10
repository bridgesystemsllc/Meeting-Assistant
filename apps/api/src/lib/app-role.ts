import { getAppPool } from './db.js';
import { RuntimeConfigError } from './runtime-env.js';

export const REQUIRED_APP_ROLE = 'meeting_assistant_app';

/**
 * Fail closed unless APP_DATABASE_URL is the restricted app role itself
 * (session_user and current_user are meeting_assistant_app — not a member of
 * it, not a table owner, not SET ROLE onto a privileged role).
 *
 * That role must also be NOSUPERUSER NOBYPASSRLS, own no public relations or
 * SECURITY DEFINER functions, not be a member of a table owner, not receive
 * definer_access, and have only tenant-scoped policies
 * (tenant_id = current_setting('app.tenant_id')).
 */
export const APP_ROLE_GUARD_SQL = `
SELECT
  session_user::text AS session_role,
  current_user::text AS current_role,
  (session_user = '${REQUIRED_APP_ROLE}' AND current_user = '${REQUIRED_APP_ROLE}') AS is_app_role,
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
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proowner = r.oid
  ) AS owns_security_definer,
  EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_class c ON c.relowner = m.roleid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE m.member = r.oid
      AND n.nspname = 'public'
  ) AS member_of_table_owner,
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname IN ('definer_access', 'auth_definer')
      AND (
        0 = ANY (p.polroles)
        OR EXISTS (
          SELECT 1 FROM unnest(p.polroles) AS polrole
          WHERE pg_has_role(r.oid, polrole, 'MEMBER')
        )
      )
  ) AS has_definer_access,
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (
        0 = ANY (p.polroles)
        OR EXISTS (
          SELECT 1 FROM unnest(p.polroles) AS polrole
          WHERE pg_has_role(r.oid, polrole, 'MEMBER')
        )
      )
      AND NOT (
        EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = p.polrelid
            AND a.attname = 'tenant_id'
            AND NOT a.attisdropped
        )
        AND p.polqual IS NOT NULL
        AND pg_get_expr(p.polqual, p.polrelid) LIKE '%tenant_id =%current_setting%app.tenant_id%'
        AND (
          p.polwithcheck IS NULL
          OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%tenant_id =%current_setting%app.tenant_id%'
        )
      )
  ) AS has_nontenant_policy
FROM pg_roles r
WHERE r.rolname = current_user
`;

export interface RoleAttrs {
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export interface AppRoleGuardRow extends RoleAttrs {
  session_role: string;
  current_role: string;
  is_app_role: boolean;
  owns_public_relation: boolean;
  owns_security_definer: boolean;
  member_of_table_owner: boolean;
  has_definer_access: boolean;
  has_nontenant_policy: boolean;
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

/** Fail closed unless APP_DATABASE_URL is the restricted app role itself. */
export function assertRestrictedAppRole(
  row: AppRoleGuardRow | undefined,
  roleLabel = 'connected database role'
): void {
  if (!row) {
    throw new RuntimeConfigError(`${roleLabel} is missing from pg_roles`);
  }
  if (!row.is_app_role) {
    throw new RuntimeConfigError(
      `APP_DATABASE_URL must connect as ${REQUIRED_APP_ROLE} (session_user and current_user); members of that role are not allowed (session_user=${row.session_role} current_user=${row.current_role})`
    );
  }
  assertNosuperuserNobypassrls(row, REQUIRED_APP_ROLE);
  if (row.owns_public_relation) {
    throw new RuntimeConfigError(`${REQUIRED_APP_ROLE} must not own relations in public`);
  }
  if (row.owns_security_definer) {
    throw new RuntimeConfigError(`${REQUIRED_APP_ROLE} must not own SECURITY DEFINER functions`);
  }
  if (row.member_of_table_owner) {
    throw new RuntimeConfigError(`${REQUIRED_APP_ROLE} must not be a member of a table-owner role`);
  }
  if (row.has_definer_access) {
    throw new RuntimeConfigError(`${REQUIRED_APP_ROLE} must not be granted definer_access`);
  }
  if (row.has_nontenant_policy) {
    throw new RuntimeConfigError(
      `${REQUIRED_APP_ROLE} must only have tenant-scoped policies (tenant_id = current_setting('app.tenant_id'))`
    );
  }
}

export async function assertConnectedAppRole(): Promise<void> {
  const result = await getAppPool().query<AppRoleGuardRow>(APP_ROLE_GUARD_SQL);
  assertRestrictedAppRole(result.rows[0]);
}
