/**
 * Microsoft multi-tenant issuer validation.
 * Tokens from the common/organizations authority have iss = https://login.microsoftonline.com/{tid}/v2.0
 */

export class InvalidIssuerError extends Error {
  readonly code = 'INVALID_ISSUER' as const;
  constructor(message = 'Microsoft issuer does not match token tenant') {
    super(message);
    this.name = 'InvalidIssuerError';
  }
}

export function expectedMicrosoftIssuers(tid: string): string[] {
  return [
    `https://login.microsoftonline.com/${tid}/v2.0`,
    `https://sts.windows.net/${tid}/`,
  ];
}

export function assertMicrosoftIssuer(
  iss: string | undefined,
  tid: string | undefined,
  options: { allowMock?: boolean } = {}
): void {
  if (!iss || !tid) {
    throw new InvalidIssuerError('Microsoft token missing issuer or tenant id');
  }

  if (expectedMicrosoftIssuers(tid).includes(iss)) {
    return;
  }

  const allowMock = options.allowMock ?? process.env.OIDC_ALLOW_MOCK === 'true';
  if (allowMock) {
    const isLoopback = iss.startsWith('http://127.0.0.1') || iss.startsWith('http://localhost');
    if (isLoopback) {
      return;
    }
  }

  throw new InvalidIssuerError();
}
