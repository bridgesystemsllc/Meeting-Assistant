import { describe, expect, it } from 'vitest';
import { assertNosuperuserNobypassrls, assertRestrictedAppRole } from './app-role.js';
import { RuntimeConfigError } from './runtime-env.js';
import type { AppRoleGuardRow } from './app-role.js';

function restricted(overrides: Partial<AppRoleGuardRow> = {}): AppRoleGuardRow {
  return {
    rolsuper: false,
    rolbypassrls: false,
    owns_public_relation: false,
    has_unrestricted_rls_policy: false,
    ...overrides,
  };
}

describe('assertNosuperuserNobypassrls', () => {
  it('accepts NOSUPERUSER NOBYPASSRLS', () => {
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: false, rolbypassrls: false })
    ).not.toThrow();
  });

  it('refuses SUPERUSER even when NOBYPASSRLS', () => {
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: true, rolbypassrls: false })
    ).toThrow(RuntimeConfigError);
  });

  it('refuses BYPASSRLS even when NOSUPERUSER', () => {
    expect(() =>
      assertNosuperuserNobypassrls({ rolsuper: false, rolbypassrls: true })
    ).toThrow(/NOBYPASSRLS/);
  });

  it('refuses a missing pg_roles row', () => {
    expect(() => assertNosuperuserNobypassrls(undefined)).toThrow(RuntimeConfigError);
  });
});

describe('assertRestrictedAppRole', () => {
  it('accepts the restricted app role', () => {
    expect(() => assertRestrictedAppRole(restricted())).not.toThrow();
  });

  it('refuses a NOSUPERUSER NOBYPASSRLS table owner', () => {
    expect(() => assertRestrictedAppRole(restricted({ owns_public_relation: true }))).toThrow(
      /owns relations in public/
    );
  });

  it('refuses a role granted definer_access or USING (true)', () => {
    expect(() =>
      assertRestrictedAppRole(restricted({ has_unrestricted_rls_policy: true }))
    ).toThrow(/USING \(true\)/);
  });
});
