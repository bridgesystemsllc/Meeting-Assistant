/**
 * App-role calls into SECURITY DEFINER auth functions.
 * Global tables are not queried directly.
 */

import type pg from 'pg';
import { db } from './db.js';

type AuthQueryClient = Pick<pg.PoolClient, 'query'>;

function exec(client?: AuthQueryClient): AuthQueryClient {
  return client ?? db;
}

export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthMembershipRow {
  id: string;
  role: 'owner' | 'admin' | 'member';
  seat_status: 'invited' | 'active' | 'deactivated';
  tenant: { id: string; name: string; slug: string };
}

export interface AuthSessionContext {
  session_id: string;
  expires_at: string;
  idle_expires_at: string;
  active_tenant_id: string | null;
  user: AuthUserRow;
  memberships: AuthMembershipRow[];
}

export interface OidcStateRow {
  id: string;
  state: string;
  nonce: string;
  code_verifier: string | null;
  provider: 'google' | 'microsoft';
  redirect_uri: string | null;
  invite_token_hash: string | null;
}

export async function storeOidcState(params: {
  state: string;
  nonce: string;
  codeVerifier: string;
  provider: 'google' | 'microsoft';
  redirectUri: string;
  inviteTokenHash: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db.query('SELECT auth_store_oidc_state($1,$2,$3,$4,$5,$6,$7)', [
    params.state,
    params.nonce,
    params.codeVerifier,
    params.provider,
    params.redirectUri,
    params.inviteTokenHash,
    params.expiresAt.toISOString(),
  ]);
}

export async function consumeOidcState(state: string): Promise<OidcStateRow | null> {
  const result = await db.query<{ auth_consume_oidc_state: OidcStateRow | null }>(
    'SELECT auth_consume_oidc_state($1) AS auth_consume_oidc_state',
    [state]
  );
  return result.rows[0]?.auth_consume_oidc_state ?? null;
}

export interface ResolveIdentityResult {
  ok: boolean;
  code?: string;
  user?: AuthUserRow;
  memberships?: AuthMembershipRow[];
  invite?: { ok: boolean; code?: string; membership_id?: string; tenant_id?: string; role?: string };
}

export async function resolveIdentity(
  params: {
    issuer: string;
    subject: string;
    provider: 'google' | 'microsoft';
    email: string;
    name: string | null;
    emailVerified: boolean;
    inviteTokenHash: string | null;
  },
  client?: AuthQueryClient
): Promise<ResolveIdentityResult> {
  const result = await exec(client).query<{ auth_resolve_identity: ResolveIdentityResult }>(
    'SELECT auth_resolve_identity($1,$2,$3,$4,$5,$6,$7) AS auth_resolve_identity',
    [
      params.issuer,
      params.subject,
      params.provider,
      params.email,
      params.name ?? '',
      params.emailVerified,
      params.inviteTokenHash,
    ]
  );
  return result.rows[0].auth_resolve_identity;
}

export async function upsertUser(email: string, name: string | null): Promise<AuthUserRow> {
  const result = await db.query<{ auth_upsert_user: AuthUserRow }>(
    'SELECT auth_upsert_user($1,$2) AS auth_upsert_user',
    [email, name ?? '']
  );
  return result.rows[0].auth_upsert_user;
}

export async function purgeExpiredAuthRows(): Promise<number> {
  const result = await db.query<{ auth_purge_expired: number }>('SELECT auth_purge_expired() AS auth_purge_expired');
  return Number(result.rows[0]?.auth_purge_expired ?? 0);
}

export async function membershipsForEmail(email: string): Promise<AuthMembershipRow[]> {
  const result = await db.query<{ auth_memberships_for_email: AuthMembershipRow[] | null }>(
    'SELECT auth_memberships_for_email($1) AS auth_memberships_for_email',
    [email]
  );
  return result.rows[0]?.auth_memberships_for_email ?? [];
}

export async function createSession(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  activeTenantId: string | null;
}): Promise<string> {
  const result = await db.query<{ auth_create_session: string }>(
    'SELECT auth_create_session($1,$2,$3,$4,$5) AS auth_create_session',
    [
      params.userId,
      params.tokenHash,
      params.expiresAt.toISOString(),
      params.idleExpiresAt.toISOString(),
      params.activeTenantId,
    ]
  );
  return result.rows[0].auth_create_session;
}

export async function sessionContext(tokenHash: string): Promise<AuthSessionContext | null> {
  const result = await db.query<{ auth_session_context: AuthSessionContext | null }>(
    'SELECT auth_session_context($1) AS auth_session_context',
    [tokenHash]
  );
  return result.rows[0]?.auth_session_context ?? null;
}

export async function touchSession(tokenHash: string, idleExpiresAt: Date): Promise<void> {
  await db.query('SELECT auth_touch_session($1,$2)', [tokenHash, idleExpiresAt.toISOString()]);
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.query('SELECT auth_delete_session($1)', [tokenHash]);
}

export async function acceptInvite(
  tokenHash: string,
  userId: string,
  email: string,
  client?: AuthQueryClient
): Promise<{ ok: boolean; code?: string; membership_id?: string; tenant_id?: string; role?: string }> {
  const result = await exec(client).query<{
    auth_accept_invite: {
      ok: boolean;
      code?: string;
      membership_id?: string;
      tenant_id?: string;
      role?: string;
    };
  }>('SELECT auth_accept_invite($1,$2,$3) AS auth_accept_invite', [tokenHash, userId, email]);
  return result.rows[0].auth_accept_invite;
}

export interface InviteLookup {
  ok: boolean;
  code?: string;
  id?: string;
  email?: string;
  role?: string;
  expires_at?: string;
  tenant?: { id: string; name: string; slug: string };
}

export async function lookupInvite(tokenHash: string, expectedSlug: string | null): Promise<InviteLookup> {
  const result = await db.query<{ auth_lookup_invite: InviteLookup }>(
    'SELECT auth_lookup_invite($1,$2) AS auth_lookup_invite',
    [tokenHash, expectedSlug]
  );
  return result.rows[0].auth_lookup_invite;
}
