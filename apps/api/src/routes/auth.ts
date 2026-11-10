import { Router, type Request, type Response } from 'express';
import type { OidcProvider } from '@meeting-assistant/shared';
import { OidcProviderSchema } from '@meeting-assistant/shared';
import { hashToken } from '../lib/crypto.js';
import { HttpError, sendError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import {
  acceptInvite,
  consumeOidcState,
  lookupInvite,
  membershipsForEmail,
  storeOidcState,
  upsertUser,
} from '../lib/auth-db.js';
import { buildAuthorizationRequest, exchangeAuthorizationCode, getProviderConfig } from '../lib/oidc.js';
import { recordAudit } from '../lib/audit.js';
import { db, withTenant } from '../lib/db.js';
import { issueSession, loadSession, readSessionToken, revokeSession } from '../lib/session.js';

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

const INVITE_ERROR_QUERY: Record<string, string> = {
  INVALID_INVITE: 'invalid_invite',
  INVITE_USED: 'invite_used',
  INVITE_EXPIRED: 'invite_expired',
  INVITE_REVOKED: 'invite_revoked',
  INVITE_WRONG_TENANT: 'invite_tenant',
  INVITE_EMAIL_MISMATCH: 'invite_email',
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

    const callbackUrl = new URL(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`
    );

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
      if (stored.invite_token_hash) {
        const preview = await lookupInvite(stored.invite_token_hash, null);
        if (preview.tenant?.id) {
          try {
            await withTenant(preview.tenant.id, (tx) =>
              recordAudit(tx, {
                action: 'failed-login',
                targetType: 'invite',
                targetId: preview.id ?? null,
                metadata: { code: err instanceof HttpError ? err.code : 'OIDC_FAILED' },
              })
            );
          } catch (auditErr) {
            logger.error({ err: auditErr }, 'failed-login audit failed');
          }
        }
      }
      if (err instanceof HttpError) {
        sendError(res, err.statusCode, err.code, err.message);
        return;
      }
      throw err;
    }

    const user = await upsertUser(claims.email, claims.name);
    let memberships = await membershipsForEmail(user.email);

    if (stored.invite_token_hash) {
      const preview = await lookupInvite(stored.invite_token_hash, null);
      const accepted = await db.transaction(async (tx) => {
        const result = await acceptInvite(stored.invite_token_hash!, user.id, user.email, tx);
        const tenantId = result.tenant_id ?? preview.tenant?.id ?? null;
        if (tenantId) {
          await tx.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
          if (result.ok) {
            await recordAudit(tx, {
              actorUserId: user.id,
              action: 'invite.accepted',
              targetType: 'membership',
              targetId: result.membership_id ?? null,
              email: user.email,
            });
          } else {
            await recordAudit(tx, {
              actorUserId: user.id,
              action: 'failed-invite',
              targetType: 'invite',
              targetId: preview.id ?? null,
              email: user.email,
              metadata: { code: result.code },
            });
          }
        }
        return result;
      });
      if (!accepted.ok) {
        logger.info({ code: accepted.code }, 'invite acceptance failed');
        redirectToLogin(res, INVITE_ERROR_QUERY[accepted.code ?? 'INVALID_INVITE'] ?? 'invalid_invite');
        return;
      }
      memberships = await membershipsForEmail(user.email);
    }

    if (memberships.length === 0) {
      redirectToLogin(res, 'no_access');
      return;
    }

    const active = memberships.filter((m) => m.seat_status === 'active');
    const selected = active[0] ?? memberships[0];

    const previous = readSessionToken(req.cookies);
    const session = await issueSession({
      userId: user.id,
      activeTenantId: selected.tenant.id,
      previousToken: previous,
    });

    await withTenant(selected.tenant.id, (tx) =>
      recordAudit(tx, {
        actorUserId: user.id,
        action: 'login',
        targetType: 'user',
        targetId: user.id,
      })
    );

    res.setHeader('Set-Cookie', session.setCookie);
    res.redirect(`${frontendUrl()}/meetings`);
  } catch (err) {
    next(err);
  }
});

async function handleLogout(req: Request, res: Response, wantsJson: boolean): Promise<void> {
  const token = readSessionToken(req.cookies);
  const ctx = token ? await loadSession(token) : null;
  const cleared = await revokeSession(token);
  if (ctx?.user && ctx.active_tenant_id) {
    try {
      await withTenant(ctx.active_tenant_id, (tx) =>
        recordAudit(tx, {
          actorUserId: ctx.user.id,
          action: 'logout',
          targetType: 'user',
          targetId: ctx.user.id,
        })
      );
    } catch (err) {
      logger.error({ err }, 'logout audit failed');
    }
  }
  res.setHeader('Set-Cookie', cleared);
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

authRouter.get('/logout', async (req, res, next) => {
  try {
    await handleLogout(req, res, false);
  } catch (err) {
    next(err);
  }
});
