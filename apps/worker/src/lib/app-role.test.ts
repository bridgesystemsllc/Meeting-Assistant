import { describe, expect, it } from 'vitest';
import { assertNosuperuserNobypassrls, assertRestrictedAppRole } from './app-role.js';
import type { AppRoleGuardRow } from './app-role.js';
import { WorkerConfigError } from './env.js';

function restricted(overrides: Partial<AppRoleGuardRow> = {}): AppRoleGuardRow {
  return {
    rolsuper: false,
    rolbypassrls: false,
    owns_public_relation: false,
    has_unrestricted_rls_policy: false,
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
