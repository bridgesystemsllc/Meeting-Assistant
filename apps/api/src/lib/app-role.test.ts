import { describe, expect, it } from 'vitest';
import { assertNosuperuserNobypassrls } from './app-role.js';
import { RuntimeConfigError } from './runtime-env.js';

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
