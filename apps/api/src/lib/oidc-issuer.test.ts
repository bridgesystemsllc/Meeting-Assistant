import { describe, it, expect } from 'vitest';
import { assertMicrosoftIssuer, expectedMicrosoftIssuers, InvalidIssuerError } from './oidc-issuer.js';

describe('Microsoft issuer validation', () => {
  const tid = '11111111-2222-3333-4444-555555555555';

  it('accepts the v2 organizations issuer for the token tenant', () => {
    expect(() => assertMicrosoftIssuer(expectedMicrosoftIssuers(tid)[0], tid)).not.toThrow();
  });

  it('accepts the v1 sts issuer for the token tenant', () => {
    expect(() => assertMicrosoftIssuer(expectedMicrosoftIssuers(tid)[1], tid)).not.toThrow();
  });

  it('rejects a mismatched tenant in the issuer', () => {
    expect(() =>
      assertMicrosoftIssuer('https://login.microsoftonline.com/other-tenant/v2.0', tid)
    ).toThrow(InvalidIssuerError);
  });

  it('rejects a missing tid', () => {
    expect(() =>
      assertMicrosoftIssuer('https://login.microsoftonline.com/common/v2.0', undefined)
    ).toThrow(InvalidIssuerError);
  });

  it('allows loopback issuers when mock mode is on', () => {
    expect(() =>
      assertMicrosoftIssuer('http://127.0.0.1:43721', tid, { allowMock: true })
    ).not.toThrow();
  });
});
