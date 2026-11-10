import { describe, expect, it } from 'vitest';
import { assertNosuperuserNobypassrls, assertRestrictedAppRole } from './app-role.js';
import type { AppRoleGuardRow } from './app-role.js';
import { WorkerConfigError } from './env.js';

function restricted(overrides: Partial<AppRoleGuardRow> = {}): AppRoleGuardRow {
  return {
    session_role: 'meeting_assistant_app',
    current_role: 'meeting_assistant_app',
    is_app_role: true,
    rolsuper: false,
    rolbypassrls: false,
    owns_public_relation: false,
    owns_security_definer: false,
    has_role_membership: false,
    member_of_table_owner: false,
    has_definer_access: false,
    has_nontenant_policy: false,
    ...overrides,
  };
}

describe('worker assertNosuperuserNobypassrls', () => {
  it('accepts NOSUPERUSER NOBYPASSRLS', () => {
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: false, rolbypassrls: false })
    ).not.toThrow();
  });

  it('refuses SUPERUSER or BYPASSRLS', () => {
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: true, rolbypassrls: false })
    ).toThrow(WorkerConfigError);
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: false, rolbypassrls: true })
    ).toThrow(/NOBYPASSRLS/);
  });
});

describe('worker assertRestrictedAppRole', () => {
  it('accepts only meeting_assistant_app itself', () => {
    expect(() => assertRestrictedAppRole(restricted())).not.toThrow();
  });

  it('refuses a login that is not meeting_assistant_app', () => {
    expect(() =>
      assertRestrictedAppRole(
        restricted({
          session_role: 'ma_owner_inherit',
          current_role: 'ma_owner_inherit',
          is_app_role: false,
        })
      )
    ).toThrow(/must connect as meeting_assistant_app/);
  });

  it('refuses a member of meeting_assistant_app that is not that role', () => {
    expect(() =>
      assertRestrictedAppRole(
        restricted({
          session_role: 'ma_app_member',
          current_role: 'ma_app_member',
          is_app_role: false,
        })
      )
    ).toThrow(/members of that role are not allowed/);
  });

  it('refuses NOINHERIT + SET ROLE onto another role', () => {
    expect(() =>
      assertRestrictedAppRole(
        restricted({
          session_role: 'ma_owner_noinherit',
          current_role: 'meeting_assistant_owner',
          is_app_role: false,
        })
      )
    ).toThrow(/must connect as meeting_assistant_app/);
  });

  it('refuses SUPERUSER even when the name is meeting_assistant_app', () => {
    expect(() => assertRestrictedAppRole(restricted({ rolsuper: true }))).toThrow(/NOSUPERUSER/);
  });

  it('refuses a table owner', () => {
    expect(() => assertRestrictedAppRole(restricted({ owns_public_relation: true }))).toThrow(
      /must not own relations in public/
    );
  });

  it('refuses SECURITY DEFINER ownership', () => {
    expect(() => assertRestrictedAppRole(restricted({ owns_security_definer: true }))).toThrow(
      /SECURITY DEFINER/
    );
  });

  it('refuses any role membership', () => {
    expect(() => assertRestrictedAppRole(restricted({ has_role_membership: true }))).toThrow(
      /must not have any role membership/
    );
  });

  it('refuses membership of a table-owner role', () => {
    expect(() => assertRestrictedAppRole(restricted({ member_of_table_owner: true }))).toThrow(
      /table-owner/
    );
  });

  it('refuses definer_access', () => {
    expect(() => assertRestrictedAppRole(restricted({ has_definer_access: true }))).toThrow(
      /definer_access/
    );
  });

  it('refuses a policy that is not tenant-scoped', () => {
    expect(() => assertRestrictedAppRole(restricted({ has_nontenant_policy: true }))).toThrow(
      /tenant-scoped policies/
    );
  });
});
