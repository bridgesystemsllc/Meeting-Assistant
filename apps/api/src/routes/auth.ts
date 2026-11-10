import { Router, type Request, type Response } from 'express';
import type { OidcProvider } from '@meeting-assistant/shared';
import { OidcProviderSchema } from '@meeting-assistant/shared';
import { hashToken } from '../lib/crypto.js';
import { HttpError, sendError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { resolveIdentity, consumeOidcState, storeOidcState } from '../lib/auth-db.js';
import {
  buildAuthorizationRequest,
  callbackUrlFromStored,
  exchangeAuthorizationCode,
  getProviderConfig,
} from '../lib/oidc.js';
import {
  oidcStateCookieMatches,
  serializeClearedOidcStateCookie,
  serializeOidcStateCookie,
} from '../lib/oidc-state-cookie.js';
import { issueSession, readSessionToken, revokeSession } from '../lib/session.js';

export const authRouter = Router();

const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function redirectToLogin(res: { redirect: (url: string) => void }, error: string): void {
  res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(error)}`);
}

function parseProvider(value: string): OidcProvider | null {
  const parsed = OidcProviderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function appendCookies(res: Response, values: string | string[]): void {
  for (const value of Array.isArray(values) ? values : [values]) {
    res.append('Set-Cookie', value);
  }
}

authRouter.get('/login/:provider', async (req, res, next) => {
  try {
    const provider = parseProvider(req.params.provider);
    if (!provider) {
      sendError(res, 404, 'OIDC_FAILED', 'Unknown identity provider');
      return;
    }
    if (!getProviderConfig(provider)) {
      sendError(res, 503, 'OIDC_FAILED', `${provider} sign-in is not configured`);
      return;
    }

    const invite = typeof req.query.invite === 'string' ? req.query.invite : null;
    const started = await buildAuthorizationRequest(provider);
    await storeOidcState({
      state: started.state,
      nonce: started.nonce,
      codeVerifier: started.codeVerifier,
      provider,
      redirectUri: started.redirectUri,
      inviteTokenHash: invite ? hashToken(invite) : null,
      expiresAt: new Date(Date.now() + OIDC_STATE_TTL_MS),
    });

    appendCookies(res, serializeOidcStateCookie(started.state));
    res.redirect(started.url.toString());
  } catch (err) {
    next(err);
  }
});

authRouter.get('/callback/:provider', async (req, res, next) => {
  try {
    const provider = parseProvider(req.params.provider);
    if (!provider) {
      sendError(res, 400, 'OIDC_FAILED', 'Unknown identity provider');
      return;
    }

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state) {
      sendError(res, 400, 'INVALID_STATE', 'OIDC state mismatch');
      return;
    }

    if (!oidcStateCookieMatches(req.cookies, state)) {
      sendError(res, 400, 'INVALID_STATE', 'OIDC state mismatch');
      return;
    }

    const stored = await consumeOidcState(state);
    if (!stored) {
      sendError(res, 400, 'INVALID_STATE', 'OIDC state mismatch');
      return;
    }

    if (stored.provider !== provider) {
      sendError(res, 400, 'INVALID_STATE', 'OIDC state mismatch');
      return;
    }

    const nonceParam = typeof req.query.nonce === 'string' ? req.query.nonce : undefined;
    if (nonceParam && nonceParam !== stored.nonce) {
      sendError(res, 400, 'INVALID_NONCE', 'OIDC nonce mismatch');
      return;
    }

    if (!stored.redirect_uri) {
      sendError(res, 400, 'OIDC_FAILED', 'OIDC redirect_uri missing');
      return;
    }

    const currentUrl = new URL(`http://127.0.0.1${req.originalUrl}`);
    const callbackUrl = callbackUrlFromStored(stored.redirect_uri, currentUrl);

    let claims;
    try {
      claims = await exchangeAuthorizationCode({
        provider,
        callbackUrl,
        expectedState: stored.state,
        expectedNonce: stored.nonce,
        codeVerifier: stored.code_verifier || '',
      });
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, err.statusCode, err.code, err.message);
        return;
      }
      throw err;
    }

    const resolved = await resolveIdentity({
      issuer: claims.iss,
      subject: claims.sub,
      provider,
      email: claims.email,
      name: claims.name,
      emailVerified: claims.emailVerified,
      inviteTokenHash: stored.invite_token_hash,
    });

    if (!resolved.ok || !resolved.user) {
      const code = resolved.code ?? 'OIDC_FAILED';
      if (code === 'EMAIL_UNVERIFIED') {
        sendError(res, 400, 'EMAIL_UNVERIFIED', 'Email is not verified');
        return;
      }
      sendError(res, 400, code, 'OIDC sign-in rejected');
      return;
    }

    const memberships = resolved.memberships ?? [];
    if (stored.invite_token_hash && resolved.invite && !resolved.invite.ok) {
      if (memberships.filter((m) => m.seat_status === 'active').length === 0) {
        logger.info({ code: resolved.invite.code }, 'invite acceptance failed');
        redirectToLogin(
          res,
          resolved.invite.code === 'INVITE_EMAIL_MISMATCH' ? 'invite_email' : 'invalid_invite'
        );
        return;
      }
    }

    const active = memberships.filter((m) => m.seat_status === 'active');
    if (active.length === 0) {
      redirectToLogin(res, memberships.length > 0 ? 'seat_inactive' : 'no_access');
      return;
    }

    const previous = readSessionToken(req.cookies);
    const session = await issueSession({
      userId: resolved.user.id,
      activeTenantId: active[0].tenant.id,
      previousToken: previous,
    });
    appendCookies(res, serializeClearedOidcStateCookie());
    appendCookies(res, session.setCookie);
    res.redirect(`${frontendUrl()}/meetings`);
  } catch (err) {
    next(err);
  }
});

async function handleLogout(req: Request, res: Response, wantsJson: boolean): Promise<void> {
  const cleared = await revokeSession(readSessionToken(req.cookies));
  appendCookies(res, serializeClearedOidcStateCookie());
  appendCookies(res, cleared);
  if (wantsJson) {
    res.json({ ok: true });
    return;
  }
  res.redirect(`${frontendUrl()}/login`);
}

authRouter.post('/logout', async (req, res, next) => {
  try {
    const wantsJson =
      req.headers.accept?.includes('application/json') ||
      req.headers['content-type']?.includes('json');
    await handleLogout(req, res, Boolean(wantsJson));
  } catch (err) {
    next(err);
  }
});
