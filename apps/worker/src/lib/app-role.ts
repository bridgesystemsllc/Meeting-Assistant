import { getAppPool } from './db.js';
import { WorkerConfigError } from './env.js';

export const APP_ROLE_ATTRS_SQL =
  'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user';

export interface RoleAttrs {
  rolsuper: boolean;
  rolbypassrls: boolean;
}

/** Fail closed unless the connected role is NOSUPERUSER and NOBYPASSRLS. */
export function assertNosuperuserNobypassrls(
  row: RoleAttrs | undefined,
  roleLabel = 'connected database role'
): void {
  if (!row) {
    throw new WorkerConfigError(`${roleLabel} is missing from pg_roles`);
  }
  if (row.rolsuper || row.rolbypassrls) {
    throw new WorkerConfigError(
      `${roleLabel} must be NOSUPERUSER and NOBYPASSRLS (rolsuper=${String(row.rolsuper)} rolbypassrls=${String(row.rolbypassrls)})`
    );
  }
}

export async function assertConnectedAppRole(): Promise<void> {
  const result = await getAppPool().query<RoleAttrs>(APP_ROLE_ATTRS_SQL);
  assertNosuperuserNobypassrls(result.rows[0]);
}
