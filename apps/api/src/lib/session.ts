import {
  DEFAULT_ABSOLUTE_TTL_SECONDS,
  DEFAULT_IDLE_TTL_SECONDS,
  serializeClearedSessionCookie,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
} from './session-cookie.js';
import { hashToken, randomToken } from './crypto.js';
import {
  createSession,
  deleteSession,
  purgeExpiredAuthRows,
  sessionContext,
  touchSession,
  type AuthSessionContext,
} from './auth-db.js';
import type { MeResponse } from '@meeting-assistant/shared';

function absoluteTtlSeconds(): number {
  return Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS ?? DEFAULT_ABSOLUTE_TTL_SECONDS);
}

function idleTtlSeconds(): number {
  return Number(process.env.SESSION_IDLE_TTL_SECONDS ?? DEFAULT_IDLE_TTL_SECONDS);
}

export function readSessionToken(cookies: Record<string, string | undefined> | undefined): string | undefined {
  return cookies?.[SESSION_COOKIE_NAME];
}

export async function issueSession(params: {
  userId: string;
  activeTenantId: string | null;
  previousToken?: string;
}): Promise<{ token: string; setCookie: string }> {
  if (params.previousToken) {
    await deleteSession(hashToken(params.previousToken)).catch(() => undefined);
  }

  await purgeExpiredAuthRows().catch(() => undefined);

  const token = randomToken(32);
  const now = Date.now();
  const absoluteMs = absoluteTtlSeconds() * 1000;
  const idleMs = Math.min(idleTtlSeconds() * 1000, absoluteMs);
  await createSession({
    userId: params.userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now + absoluteMs),
    idleExpiresAt: new Date(now + idleMs),
    activeTenantId: params.activeTenantId,
  });

  return { token, setCookie: serializeSessionCookie(token) };
}

export async function loadSession(token: string | undefined): Promise<AuthSessionContext | null> {
  if (!token) return null;
  return sessionContext(hashToken(token));
}

export async function refreshIdleTtl(token: string): Promise<void> {
  await touchSession(hashToken(token), new Date(Date.now() + idleTtlSeconds() * 1000));
}

export async function revokeSession(token: string | undefined): Promise<string> {
  if (token) {
    await deleteSession(hashToken(token)).catch(() => undefined);
  }
  return serializeClearedSessionCookie();
}

export function toMeResponse(ctx: AuthSessionContext): MeResponse | null {
  if (ctx.memberships.length === 0) return null;

  const active = ctx.memberships.filter((m) => m.seat_status === 'active');
  const selected =
    active.find((m) => m.tenant.id === ctx.active_tenant_id) ??
    active[0] ??
    ctx.memberships.find((m) => m.tenant.id === ctx.active_tenant_id) ??
    ctx.memberships[0];

  return {
    user: ctx.user,
    tenant: selected.tenant,
    role: selected.role,
    seat_status: selected.seat_status,
    memberships: ctx.memberships,
  };
}
