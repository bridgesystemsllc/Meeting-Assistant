import { serialize, type SerializeOptions } from 'cookie';

export const SESSION_COOKIE_NAME = 'ma_session';

export const DEFAULT_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_IDLE_TTL_SECONDS = 12 * 60 * 60;

export interface SessionCookieEnv {
  nodeEnv?: string;
  cookieSecure?: string;
  absoluteTtlSeconds?: number;
}

/**
 * Cookie flags for the session token.
 * Production always sets Secure; tests/dev may override via COOKIE_SECURE.
 */
export function sessionCookieOptions(env: SessionCookieEnv = {}): SerializeOptions {
  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const secureOverride = env.cookieSecure ?? process.env.COOKIE_SECURE;
  const secure =
    secureOverride === 'true'
      ? true
      : secureOverride === 'false'
        ? false
        : nodeEnv === 'production';

  const maxAge = env.absoluteTtlSeconds ?? Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS ?? DEFAULT_ABSOLUTE_TTL_SECONDS);

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

export function serializeSessionCookie(token: string, env?: SessionCookieEnv): string {
  return serialize(SESSION_COOKIE_NAME, token, sessionCookieOptions(env));
}

export function serializeClearedSessionCookie(env?: SessionCookieEnv): string {
  return serialize(SESSION_COOKIE_NAME, '', {
    ...sessionCookieOptions(env),
    maxAge: 0,
  });
}
