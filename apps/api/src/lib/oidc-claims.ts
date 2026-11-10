import type { OidcProvider } from '@meeting-assistant/shared';

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
