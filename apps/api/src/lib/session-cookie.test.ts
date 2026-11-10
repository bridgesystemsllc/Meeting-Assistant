import { describe, it, expect } from 'vitest';
import { serialize } from 'cookie';
import { sessionCookieOptions, serializeSessionCookie, SESSION_COOKIE_NAME } from './session-cookie.js';

describe('session cookie flags', () => {
  it('sets HttpOnly, Secure, SameSite=Lax in production', () => {
    const options = sessionCookieOptions({ nodeEnv: 'production' });
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');

    const header = serialize(SESSION_COOKIE_NAME, 'token', options);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Lax/i);
  });

  it('allows Secure=false in tests via COOKIE_SECURE', () => {
    const options = sessionCookieOptions({ nodeEnv: 'test', cookieSecure: 'false' });
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.sameSite).toBe('lax');
  });

  it('serializes the session cookie name', () => {
    const header = serializeSessionCookie('abc', { nodeEnv: 'production' });
    expect(header.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
  });
});
