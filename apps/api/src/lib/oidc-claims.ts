import type { OidcProvider } from '@meeting-assistant/shared';

export const DEFAULT_ID_TOKEN_MAX_AGE_SECONDS = 300;
export const DEFAULT_CLOCK_SKEW_SECONDS = 60;

export function parseDurationSeconds(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function oidcIdTokenMaxAgeSeconds(): number {
  return parseDurationSeconds(process.env.OIDC_ID_TOKEN_MAX_AGE_SECONDS, DEFAULT_ID_TOKEN_MAX_AGE_SECONDS);
}

export function oidcClockSkewSeconds(): number {
  return parseDurationSeconds(process.env.OIDC_CLOCK_SKEW_SECONDS, DEFAULT_CLOCK_SKEW_SECONDS);
}

export type IdTokenIatCheck = 'ok' | 'missing' | 'future' | 'too_old';

/** Reject iat older than max age, or further in the future than clock skew. */
export function checkIdTokenIat(
  iat: unknown,
  nowSeconds: number,
  maxAgeSeconds = oidcIdTokenMaxAgeSeconds(),
  clockSkewSeconds = oidcClockSkewSeconds()
): IdTokenIatCheck {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return 'missing';
  if (iat > nowSeconds + clockSkewSeconds) return 'future';
  if (nowSeconds - iat > maxAgeSeconds + clockSkewSeconds) return 'too_old';
  return 'ok';
}

function truthyClaim(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * Google: trust `email_verified`.
 * Microsoft (nOAuth): `email` is not a verified identifier unless `xms_edov`
 * (email domain owner verified) or a verified-primary-email claim is present.
 */
export function isOidcEmailVerified(
  provider: OidcProvider,
  claims: Record<string, unknown>
): boolean {
  if (provider === 'google') {
    return claims.email_verified === true;
  }

  if (truthyClaim(claims.xms_edov)) {
    return true;
  }

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  const verifiedPrimary =
    typeof claims.verified_primary_email === 'string'
      ? claims.verified_primary_email.toLowerCase()
      : '';
  return Boolean(email && verifiedPrimary && email === verifiedPrimary);
}
