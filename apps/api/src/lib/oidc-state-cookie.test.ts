import { describe, expect, it, beforeAll } from 'vitest';
import {
  oidcStateCookieMatches,
  serializeOidcStateCookie,
  OIDC_STATE_COOKIE,
} from './oidc-state-cookie.js';

describe('OIDC state cookie', () => {
  beforeAll(() => {
    process.env.OIDC_STATE_SECRET = 'test-oidc-state-secret';
    process.env.NODE_ENV = 'test';
    process.env.COOKIE_SECURE = 'false';
  });

  it('is httpOnly, SameSite=Lax, and short-lived', () => {
    const header = serializeOidcStateCookie('abc');
    expect(header).toMatch(new RegExp(`^${OIDC_STATE_COOKIE}=`));
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/Max-Age=600/i);
    expect(header).not.toContain('abc');
  });

  it('accepts the matching browser cookie and rejects a mismatch', () => {
    const header = serializeOidcStateCookie('state-one');
    const value = header.split(';')[0].split('=')[1];
    expect(oidcStateCookieMatches({ [OIDC_STATE_COOKIE]: value }, 'state-one')).toBe(true);
    expect(oidcStateCookieMatches({ [OIDC_STATE_COOKIE]: value }, 'state-two')).toBe(false);
    expect(oidcStateCookieMatches({}, 'state-one')).toBe(false);
  });
});
