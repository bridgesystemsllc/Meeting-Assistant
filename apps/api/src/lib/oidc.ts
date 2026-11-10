import * as client from 'openid-client';
import * as jose from 'jose';
import type { OidcProvider } from '@meeting-assistant/shared';
import { logger } from './logger.js';
import { assertMicrosoftIssuer } from './oidc-issuer.js';
import {
  checkIdTokenIat,
  isOidcEmailVerified,
  oidcClockSkewSeconds,
  oidcIdTokenMaxAgeSeconds,
} from './oidc-claims.js';
import { HttpError } from './http-error.js';
import { publicBaseUrl } from './runtime-env.js';

export interface OidcProviderConfig {
  issuer: URL;
  clientId: string;
  clientSecret: string;
}

const cached = new Map<OidcProvider, client.Configuration>();
const jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

export function providerRedirectUri(provider: OidcProvider): string {
  return `${publicBaseUrl()}/api/v1/auth/callback/${provider}`;
}

export function getProviderConfig(provider: OidcProvider): OidcProviderConfig | null {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      issuer: new URL(process.env.GOOGLE_ISSUER || 'https://accounts.google.com'),
      clientId,
      clientSecret,
    };
  }

  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    issuer: new URL(process.env.MS_ISSUER || 'https://login.microsoftonline.com/organizations/v2.0'),
    clientId,
    clientSecret,
  };
}

function assertProductionIssuer(cfg: OidcProviderConfig): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.OIDC_ALLOW_MOCK === 'true') {
    throw new HttpError(503, 'OIDC_FAILED', 'OIDC_ALLOW_MOCK cannot be set when NODE_ENV=production');
  }
  if (cfg.issuer.protocol === 'http:') {
    throw new HttpError(503, 'OIDC_FAILED', 'HTTP OIDC issuers are not allowed in production');
  }
}

export async function getOidcConfiguration(provider: OidcProvider): Promise<client.Configuration> {
  const existing = cached.get(provider);
  if (existing) return existing;

  const cfg = getProviderConfig(provider);
  if (!cfg) {
    throw new HttpError(503, 'OIDC_FAILED', `${provider} sign-in is not configured`);
  }
  assertProductionIssuer(cfg);

  const allowInsecure =
    process.env.NODE_ENV !== 'production' &&
    (process.env.OIDC_ALLOW_MOCK === 'true' || cfg.issuer.protocol === 'http:');
  const configuration = await client.discovery(
    cfg.issuer,
    cfg.clientId,
    allowInsecure ? undefined : { client_secret: cfg.clientSecret },
    allowInsecure ? client.None() : undefined,
    allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
  );
  cached.set(provider, configuration);
  return configuration;
}

/** Test hook: drop cached discovery (mock IdP restarts on a new port). */
export function clearOidcCache(): void {
  cached.clear();
  jwksCache.clear();
}

export async function buildAuthorizationRequest(provider: OidcProvider): Promise<{
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
}> {
  const configuration = await getOidcConfiguration(provider);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const redirectUri = providerRedirectUri(provider);

  const url = client.buildAuthorizationUrl(configuration, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { url, state, nonce, codeVerifier, redirectUri };
}

export interface OidcClaims {
  sub: string;
  email: string;
  name: string | null;
  iss: string;
  tid?: string;
  emailVerified: boolean;
}

export function callbackUrlFromStored(storedRedirectUri: string, requestUrl: URL): URL {
  const callback = new URL(storedRedirectUri);
  callback.search = '';
  for (const key of ['code', 'state', 'error', 'error_description', 'iss']) {
    const value = requestUrl.searchParams.get(key);
    if (value) callback.searchParams.set(key, value);
  }
  return callback;
}

async function verifyIdTokenSignature(
  configuration: client.Configuration,
  idToken: string
): Promise<void> {
  const meta = configuration.serverMetadata();
  if (!meta.jwks_uri) {
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC issuer has no JWKS');
  }
  let jwks = jwksCache.get(meta.jwks_uri);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(meta.jwks_uri));
    jwksCache.set(meta.jwks_uri, jwks);
  }
  try {
    await jose.jwtVerify(idToken, jwks, {
      issuer: meta.issuer,
      audience: configuration.clientMetadata().client_id,
      algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256'],
    });
  } catch {
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC id_token signature invalid');
  }
}

export async function exchangeAuthorizationCode(params: {
  provider: OidcProvider;
  callbackUrl: URL;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
}): Promise<OidcClaims> {
  const configuration = await getOidcConfiguration(params.provider);

  let tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
  try {
    tokens = await client.authorizationCodeGrant(configuration, params.callbackUrl, {
      pkceCodeVerifier: params.codeVerifier,
      expectedState: params.expectedState,
      expectedNonce: params.expectedNonce,
      idTokenExpected: true,
    });
  } catch (err) {
    logger.warn({ provider: params.provider, err: (err as Error).name }, 'OIDC token exchange failed');
    const message = err instanceof Error ? err.message : '';
    if (/state/i.test(message)) {
      throw new HttpError(400, 'INVALID_STATE', 'OIDC state mismatch');
    }
    if (/nonce/i.test(message)) {
      throw new HttpError(400, 'INVALID_NONCE', 'OIDC nonce mismatch');
    }
    if (/pkce|verifier|challenge/i.test(message)) {
      throw new HttpError(400, 'INVALID_PKCE', 'OIDC PKCE mismatch');
    }
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC token exchange failed');
  }

  if (!tokens.id_token) {
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC token missing id_token');
  }
  await verifyIdTokenSignature(configuration, tokens.id_token);

  const claims = tokens.claims();
  if (!claims) {
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC token missing claims');
  }

  const iatCheck = checkIdTokenIat(
    claims.iat,
    Math.floor(Date.now() / 1000),
    oidcIdTokenMaxAgeSeconds(),
    oidcClockSkewSeconds()
  );
  if (iatCheck !== 'ok') {
    const message =
      iatCheck === 'missing'
        ? 'OIDC id_token missing iat'
        : iatCheck === 'future'
          ? 'OIDC id_token iat is in the future'
          : 'OIDC id_token iat exceeds max age';
    throw new HttpError(400, 'OIDC_FAILED', message);
  }

  if (params.provider === 'microsoft') {
    const tid = typeof claims.tid === 'string' ? claims.tid : undefined;
    try {
      assertMicrosoftIssuer(claims.iss, tid);
    } catch {
      throw new HttpError(400, 'INVALID_ISSUER', 'Microsoft issuer does not match token tenant');
    }
  }

  const email = typeof claims.email === 'string' ? claims.email : undefined;
  if (!email) {
    throw new HttpError(400, 'OIDC_FAILED', 'OIDC profile is missing an email');
  }

  const name =
    typeof claims.name === 'string'
      ? claims.name
      : typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : null;

  return {
    sub: String(claims.sub),
    email,
    name,
    iss: String(claims.iss),
    tid: typeof claims.tid === 'string' ? claims.tid : undefined,
    emailVerified: isOidcEmailVerified(params.provider, claims as Record<string, unknown>),
  };
}
