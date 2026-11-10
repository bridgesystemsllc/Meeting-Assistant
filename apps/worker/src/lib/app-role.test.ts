import { describe, expect, it } from 'vitest';
import { assertNosuperuserNobypassrls } from './app-role.js';
import { WorkerConfigError } from './env.js';

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
