import { Router, type Request, type Response } from 'express';
import type { OidcProvider } from '@meeting-assistant/shared';
import { OidcProviderSchema } from '@meeting-assistant/shared';
import { hashToken } from '../lib/crypto.js';
import { HttpError, sendError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { recordAudit } from '../lib/audit.js';
import { resolveIdentity, consumeOidcState, lookupInvite, storeOidcState } from '../lib/auth-db.js';
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

authRouter.use((_req, res, next) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

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

const INVITE_ERROR_QUERY: Record<string, string> = {
  INVALID_INVITE: 'invalid_invite',
  INVITE_USED: 'invite_used',
  INVITE_EXPIRED: 'invite_expired',
  INVITE_REVOKED: 'invite_revoked',
  INVITE_WRONG_TENANT: 'invite_tenant',
  INVITE_EMAIL_MISMATCH: 'invite_email',
  SEAT_LIMIT_REACHED: 'seat_limit',
  MEMBER_DEACTIVATED: 'member_deactivated',
  ALREADY_MEMBER: 'already_member',
  LAST_OWNER: 'last_owner',
  EMAIL_UNVERIFIED: 'unverified',
};

authRouter.get('/invites/:token', async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!token) {
      sendError(res, 400, 'INVALID_INVITE', 'That invite link is invalid.');
      return;
    }
    const slug = typeof req.query.tenant === 'string' ? req.query.tenant : null;
    const found = await lookupInvite(hashToken(token), slug);
    if (!found.ok) {
      const code = found.code ?? 'INVALID_INVITE';
      const messages: Record<string, string> = {
        INVALID_INVITE: 'That invite link is invalid.',
        INVITE_USED: 'That invite link has already been used.',
        INVITE_EXPIRED: 'That invite link has expired.',
        INVITE_REVOKED: 'That invite was revoked.',
        INVITE_WRONG_TENANT: 'That invite belongs to a different workspace.',
      };
      sendError(res, 400, code, messages[code] ?? messages.INVALID_INVITE);
      return;
    }
    res.json({
      email: found.email,
      role: found.role,
      expires_at: found.expires_at,
      tenant: found.tenant,
    });
  } catch (err) {
    next(err);
  }
});

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
    // An invite in the login state always reports its outcome. A used/expired
    // link must not silently succeed just because the user already has a seat.
    if (stored.invite_token_hash && resolved.invite && !resolved.invite.ok) {
      logger.info({ code: resolved.invite.code }, 'invite acceptance failed');
      redirectToLogin(
        res,
        INVITE_ERROR_QUERY[resolved.invite.code ?? 'INVALID_INVITE'] ?? 'invalid_invite'
      );
      return;
    }

    if (memberships.length === 0) {
      redirectToLogin(res, 'no_access');
      return;
    }

    // Invited / deactivated members still get a session so /me can show
    // status and requireActiveSeat can return 403 SEAT_INACTIVE (ATLAS Q11).
    const active = memberships.filter((m) => m.seat_status === 'active');
    const selected = active[0] ?? memberships[0];

    const previous = readSessionToken(req.cookies);
    const session = await issueSession({
      userId: resolved.user.id,
      activeTenantId: selected.tenant.id,
      previousToken: previous,
    });

    if (resolved.invite?.ok && resolved.invite.tenant_id) {
      await recordAudit({
        tenantId: resolved.invite.tenant_id,
        actorUserId: resolved.user.id,
        action: 'invite.accepted',
        target: resolved.invite.membership_id ?? resolved.invite.tenant_id,
        meta: { email: resolved.user.email },
      });
    }

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
