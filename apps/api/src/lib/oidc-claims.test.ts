import { afterEach, describe, expect, it } from 'vitest';
import {
  checkIdTokenIat,
  DEFAULT_CLOCK_SKEW_SECONDS,
  DEFAULT_ID_TOKEN_MAX_AGE_SECONDS,
  isOidcEmailVerified,
  oidcClockSkewSeconds,
  oidcIdTokenMaxAgeSeconds,
} from './oidc-claims.js';

describe('isOidcEmailVerified', () => {
  it('requires Google email_verified === true', () => {
    expect(isOidcEmailVerified('google', { email_verified: true })).toBe(true);
    expect(isOidcEmailVerified('google', { email_verified: false })).toBe(false);
    expect(isOidcEmailVerified('google', {})).toBe(false);
    expect(isOidcEmailVerified('google', { email_verified: 'true' })).toBe(false);
  });

  it('does not trust Microsoft email_verified (nOAuth)', () => {
    expect(
      isOidcEmailVerified('microsoft', {
        email: 'b1@tenant-two.example',
        email_verified: true,
      })
    ).toBe(false);
  });

  it('accepts Microsoft xms_edov', () => {
    expect(isOidcEmailVerified('microsoft', { xms_edov: true })).toBe(true);
    expect(isOidcEmailVerified('microsoft', { xms_edov: '1' })).toBe(true);
  });

  it('accepts Microsoft verified_primary_email matching email', () => {
    expect(
      isOidcEmailVerified('microsoft', {
        email: 'owner@example.com',
        verified_primary_email: 'owner@example.com',
      })
    ).toBe(true);
    expect(
      isOidcEmailVerified('microsoft', {
        email: 'owner@example.com',
        verified_primary_email: 'other@example.com',
      })
    ).toBe(false);
  });
});

describe('checkIdTokenIat', () => {
  const original = { ...process.env };
  const now = 1_700_000_000;
  const maxAge = DEFAULT_ID_TOKEN_MAX_AGE_SECONDS;
  const skew = DEFAULT_CLOCK_SKEW_SECONDS;

  afterEach(() => {
    process.env = { ...original };
  });

  it('accepts a freshly issued token', () => {
    expect(checkIdTokenIat(now, now, maxAge, skew)).toBe('ok');
  });

  it('allows a small future clock skew', () => {
    expect(checkIdTokenIat(now + skew, now, maxAge, skew)).toBe('ok');
    expect(checkIdTokenIat(now + skew + 1, now, maxAge, skew)).toBe('future');
  });

  it('rejects iat older than max age plus skew', () => {
    expect(checkIdTokenIat(now - maxAge, now, maxAge, skew)).toBe('ok');
    expect(checkIdTokenIat(now - maxAge - skew, now, maxAge, skew)).toBe('ok');
    expect(checkIdTokenIat(now - maxAge - skew - 1, now, maxAge, skew)).toBe('too_old');
  });

  it('rejects a missing iat', () => {
    expect(checkIdTokenIat(undefined, now, maxAge, skew)).toBe('missing');
  });

  it('reads configurable max age and clock skew with safe defaults', () => {
    delete process.env.OIDC_ID_TOKEN_MAX_AGE_SECONDS;
    delete process.env.OIDC_CLOCK_SKEW_SECONDS;
    expect(oidcIdTokenMaxAgeSeconds()).toBe(DEFAULT_ID_TOKEN_MAX_AGE_SECONDS);
    expect(oidcClockSkewSeconds()).toBe(DEFAULT_CLOCK_SKEW_SECONDS);

    process.env.OIDC_ID_TOKEN_MAX_AGE_SECONDS = '120';
    process.env.OIDC_CLOCK_SKEW_SECONDS = '15';
    expect(oidcIdTokenMaxAgeSeconds()).toBe(120);
    expect(oidcClockSkewSeconds()).toBe(15);
    expect(checkIdTokenIat(now - 136, now)).toBe('too_old');
    expect(checkIdTokenIat(now + 15, now)).toBe('ok');
    expect(checkIdTokenIat(now + 16, now)).toBe('future');

    process.env.OIDC_ID_TOKEN_MAX_AGE_SECONDS = '-1';
    process.env.OIDC_CLOCK_SKEW_SECONDS = 'nope';
    expect(oidcIdTokenMaxAgeSeconds()).toBe(DEFAULT_ID_TOKEN_MAX_AGE_SECONDS);
    expect(oidcClockSkewSeconds()).toBe(DEFAULT_CLOCK_SKEW_SECONDS);
  });
});
