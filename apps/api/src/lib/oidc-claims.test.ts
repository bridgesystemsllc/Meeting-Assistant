import { describe, expect, it } from 'vitest';
import { isOidcEmailVerified } from './oidc-claims.js';

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
