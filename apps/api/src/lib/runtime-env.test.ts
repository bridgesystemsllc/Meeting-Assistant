import { afterEach, describe, expect, it } from 'vitest';
import { appDatabaseUrl, assertApiRuntimeEnv, RuntimeConfigError } from './runtime-env.js';

describe('runtime env', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('refuses to use DATABASE_URL as the app role connection', () => {
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://owner@localhost/db';
    expect(() => appDatabaseUrl()).toThrow(RuntimeConfigError);
  });

  it('rejects mock OIDC in production', () => {
    process.env.APP_DATABASE_URL = 'postgres://app@localhost/db';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';
    process.env.NODE_ENV = 'production';
    process.env.OIDC_ALLOW_MOCK = 'true';
    expect(() => assertApiRuntimeEnv()).toThrow(/OIDC_ALLOW_MOCK/);
  });
});
