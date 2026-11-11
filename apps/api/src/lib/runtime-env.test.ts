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
    process.env.OIDC_STATE_SECRET = 'prod-oidc-state-secret';
    process.env.NODE_ENV = 'production';
    process.env.OIDC_ALLOW_MOCK = 'true';
    expect(() => assertApiRuntimeEnv()).toThrow(/OIDC_ALLOW_MOCK/);
  });

  it('refuses to boot in production without OIDC_STATE_SECRET', () => {
    process.env.APP_DATABASE_URL = 'postgres://app@localhost/db';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';
    process.env.NODE_ENV = 'production';
    delete process.env.OIDC_STATE_SECRET;
    expect(() => assertApiRuntimeEnv()).toThrow(/OIDC_STATE_SECRET/);
  });

  it('refuses to boot in production without SMTP_HOST', () => {
    process.env.APP_DATABASE_URL = 'postgres://app@localhost/db';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';
    process.env.OIDC_STATE_SECRET = 'prod-oidc-state-secret';
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;
    expect(() => assertApiRuntimeEnv()).toThrow(/SMTP_HOST/);
  });

  it('refuses to boot in production without AUDIT_EMAIL_HMAC_KEY', () => {
    process.env.APP_DATABASE_URL = 'postgres://app@localhost/db';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';
    process.env.OIDC_STATE_SECRET = 'prod-oidc-state-secret';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_EMAIL_HMAC_KEY;
    expect(() => assertApiRuntimeEnv()).toThrow(/AUDIT_EMAIL_HMAC_KEY/);
  });
});
