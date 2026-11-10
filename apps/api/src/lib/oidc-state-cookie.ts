import { createHmac, timingSafeEqual } from 'node:crypto';
import { serialize, type SerializeOptions } from 'cookie';
import { sessionCookieOptions } from './session-cookie.js';
import { HttpError } from './http-error.js';

export const OIDC_STATE_COOKIE = 'ma_oidc_state';
export const OIDC_STATE_COOKIE_HOST = '__Host-ma_oidc_state';
export const OIDC_STATE_TTL_SECONDS = 10 * 60;

function stateSecret(): string {
  const secret = process.env.OIDC_STATE_SECRET;
  if (!secret) {
    throw new HttpError(503, 'OIDC_FAILED', 'OIDC_STATE_SECRET is not configured');
  }
  return secret;
}

export function signOidcState(state: string): string {
  return createHmac('sha256', stateSecret()).update(state, 'utf8').digest('base64url');
}

export function oidcStateCookieName(secure: boolean): string {
  return secure ? OIDC_STATE_COOKIE_HOST : OIDC_STATE_COOKIE;
}

function cookieOptions(): SerializeOptions {
  const options = sessionCookieOptions();
  return {
    ...options,
    maxAge: OIDC_STATE_TTL_SECONDS,
    path: '/',
  };
}

export function serializeOidcStateCookie(state: string): string {
  const options = cookieOptions();
  return serialize(oidcStateCookieName(Boolean(options.secure)), signOidcState(state), options);
}

export function serializeClearedOidcStateCookie(): string[] {
  const options = { ...cookieOptions(), maxAge: 0 };
  return [
    serialize(OIDC_STATE_COOKIE, '', options),
    serialize(OIDC_STATE_COOKIE_HOST, '', { ...options, secure: true }),
  ];
}

export function readOidcStateCookie(
  cookies: Record<string, string | undefined> | undefined
): string | undefined {
  return cookies?.[OIDC_STATE_COOKIE_HOST] || cookies?.[OIDC_STATE_COOKIE];
}

export function oidcStateCookieMatches(
  cookies: Record<string, string | undefined> | undefined,
  state: string
): boolean {
  const provided = readOidcStateCookie(cookies);
  if (!provided || !state) return false;
  const expected = signOidcState(state);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
