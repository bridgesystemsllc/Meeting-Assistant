/**
 * Seat directory and invite lifecycle. All DB work runs under withTenant.
 */

import type pg from 'pg';
import {
  InviteRequestSchema,
  SeatsResponseSchema,
  seatLimitReached,
  type InviteRequest,
  type MeResponse,
  type PendingInvite,
  type SeatMember,
  type SeatsResponse,
} from '@meeting-assistant/shared';
import { recordAudit } from '../lib/audit.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { withTenant } from '../lib/db.js';
import { sendInviteEmail } from '../lib/email.js';
import { HttpError } from '../lib/http-error.js';
import { membershipsForEmail } from '../lib/auth-db.js';

const ISO = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function inviteTtlMs(): number {
  return Number(process.env.INVITE_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000;
}

function acceptUrl(token: string, slug: string): string {
  const url = new URL(`${frontendUrl()}/invite/${token}`);
  url.searchParams.set('tenant', slug);
  return url.toString();
}

interface SeatSnapshot {
  seat_limit: number;
  seats_used: number;
}

interface UserContact {
  id: string;
  email: string;
  name: string | null;
}

async function snapshot(client: pg.PoolClient, tenantId: string, forUpdate: boolean): Promise<SeatSnapshot> {
  const result = await client.query<{ s: SeatSnapshot | null }>(
    'SELECT tenant_seat_snapshot($1, $2) AS s',
    [tenantId, forUpdate]
  );
  const row = result.rows[0]?.s;
  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Tenant not found');
  }
  return row;
}

async function loadDirectory(
  client: pg.PoolClient,
  tenantId: string,
  includeDirectory: boolean
): Promise<SeatsResponse> {
  const usage = await snapshot(client, tenantId, false);
  if (!includeDirectory) {
    return SeatsResponseSchema.parse({ ...usage, members: [], invites: [] });
  }

  const memberships = await client.query<{
    id: string;
    user_id: string;
    role: SeatMember['role'];
    seat_status: SeatMember['seat_status'];
  }>(
    `SELECT id, user_id, role, seat_status
     FROM memberships
     WHERE tenant_id = $1
     ORDER BY created_at ASC`,
    [tenantId]
  );

  const userIds = memberships.rows.map((row) => row.user_id);
  const contactsResult = await client.query<{ lookup_users_contact: UserContact[] | null }>(
    'SELECT lookup_users_contact($1) AS lookup_users_contact',
    [userIds]
  );
  const contacts = new Map(
    (contactsResult.rows[0]?.lookup_users_contact ?? []).map((user) => [user.id, user])
  );

  const lastSeenResult = await client.query<{ auth_last_seen_by_user_ids: Record<string, string> | null }>(
    'SELECT auth_last_seen_by_user_ids($1) AS auth_last_seen_by_user_ids',
    [userIds]
  );
  const lastSeen = lastSeenResult.rows[0]?.auth_last_seen_by_user_ids ?? {};

  const members: SeatMember[] = memberships.rows.map((row) => {
    const user = contacts.get(row.user_id);
    return {
      id: row.id,
      user_id: row.user_id,
      name: user?.name ?? null,
      email: user?.email ?? '',
      role: row.role,
      seat_status: row.seat_status,
      last_active: lastSeen[row.user_id] ? ISO(lastSeen[row.user_id]) : null,
    };
  });

  const invitesResult = await client.query<{
    id: string;
    email: string;
    role: PendingInvite['role'];
    expires_at: Date | string;
    created_at: Date | string;
  }>(
    `SELECT id, email, role, expires_at, created_at
     FROM invites
     WHERE tenant_id = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > clock_timestamp()
     ORDER BY created_at ASC`,
    [tenantId]
  );

  const invites: PendingInvite[] = invitesResult.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expires_at: ISO(row.expires_at),
    created_at: ISO(row.created_at),
  }));

  return SeatsResponseSchema.parse({ ...usage, members, invites });
}

async function revokeSessions(client: pg.PoolClient, userId: string, tenantId: string): Promise<void> {
  await client.query('SELECT auth_revoke_sessions_for_user($1, $2)', [userId, tenantId]);
}

export async function getSeats(auth: MeResponse, includeDirectory: boolean): Promise<SeatsResponse> {
  return withTenant(auth.tenant.id, (client) => loadDirectory(client, auth.tenant.id, includeDirectory));
}

export async function getSeatUsage(tenantId: string): Promise<SeatSnapshot> {
  return withTenant(tenantId, (client) => snapshot(client, tenantId, false));
}

function assertCanAssignRole(actor: MeResponse, role: InviteRequest['role']): void {
  if (role === 'owner' && actor.role !== 'owner') {
    throw new HttpError(403, 'FORBIDDEN', 'Only an owner can invite or assign the owner role');
  }
}

async function insertInvite(
  client: pg.PoolClient,
  params: { tenantId: string; email: string; role: InviteRequest['role']; tokenHash: string; expiresAt: Date }
): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.tenantId, params.email, params.role, params.tokenHash, params.expiresAt.toISOString()]
  );
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(500, 'INTERNAL', 'Invite could not be created');
  }
  return row;
}

export async function inviteMember(auth: MeResponse, input: InviteRequest): Promise<SeatsResponse> {
  const body = InviteRequestSchema.parse(input);
  assertCanAssignRole(auth, body.role);

  const existing = (await membershipsForEmail(body.email)).find((m) => m.tenant.id === auth.tenant.id);
  if (existing && (existing.seat_status === 'active' || existing.seat_status === 'invited')) {
    throw new HttpError(409, 'ALREADY_MEMBER', 'This person already has a seat');
  }

  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + inviteTtlMs());

  const seats = await withTenant(auth.tenant.id, async (client) => {
    const usage = await snapshot(client, auth.tenant.id, true);
    if (seatLimitReached(usage.seats_used, usage.seat_limit)) {
      throw new HttpError(
        409,
        'SEAT_LIMIT_REACHED',
        `All ${usage.seat_limit} seats are in use. Ask your admin.`
      );
    }

    const pending = await client.query(
      `SELECT id FROM invites
       WHERE tenant_id = $2
         AND lower(email) = $1
         AND accepted_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > clock_timestamp()`,
      [body.email, auth.tenant.id]
    );
    if (pending.rowCount) {
      throw new HttpError(409, 'ALREADY_MEMBER', 'An invite is already pending for this email');
    }

    const invite = await insertInvite(client, {
      tenantId: auth.tenant.id,
      email: body.email,
      role: body.role,
      tokenHash,
      expiresAt,
    });
    await recordAudit({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: 'invite.sent',
      target: invite.id,
      meta: { email: body.email, role: body.role },
    });
    return loadDirectory(client, auth.tenant.id, true);
  });

  await sendInviteEmail({
    to: body.email,
    tenantName: auth.tenant.name,
    acceptUrl: acceptUrl(token, auth.tenant.slug),
  });

  return seats;
}

export async function resendInvite(auth: MeResponse, inviteId: string): Promise<SeatsResponse> {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + inviteTtlMs());
  let email = '';

  const seats = await withTenant(auth.tenant.id, async (client) => {
    const usage = await snapshot(client, auth.tenant.id, true);
    const found = await client.query<{
      id: string;
      email: string;
      role: InviteRequest['role'];
      accepted_at: Date | null;
      revoked_at: Date | null;
      expires_at: Date | string;
    }>(
      `SELECT id, email, role, accepted_at, revoked_at, expires_at
       FROM invites WHERE id = $1 AND tenant_id = $2
       FOR UPDATE`,
      [inviteId, auth.tenant.id]
    );
    const invite = found.rows[0];
    if (!invite) {
      throw new HttpError(404, 'NOT_FOUND', 'Invite not found');
    }
    if (invite.accepted_at) {
      throw new HttpError(400, 'INVITE_USED', 'That invite link has already been used.');
    }
    if (invite.revoked_at) {
      throw new HttpError(400, 'INVITE_REVOKED', 'That invite was revoked.');
    }
    const currentlyCounted = new Date(invite.expires_at).getTime() > Date.now();
    if (currentlyCounted) {
      if (usage.seats_used > usage.seat_limit) {
        throw new HttpError(
          409,
          'SEAT_LIMIT_REACHED',
          `All ${usage.seat_limit} seats are in use. Ask your admin.`
        );
      }
    } else if (seatLimitReached(usage.seats_used, usage.seat_limit)) {
      throw new HttpError(
        409,
        'SEAT_LIMIT_REACHED',
        `All ${usage.seat_limit} seats are in use. Ask your admin.`
      );
    }
    assertCanAssignRole(auth, invite.role);
    email = invite.email;
    await client.query(
      `UPDATE invites
          SET token_hash = $2,
              expires_at = $3,
              revoked_at = NULL
        WHERE id = $1 AND tenant_id = $4`,
      [inviteId, tokenHash, expiresAt.toISOString(), auth.tenant.id]
    );
    await recordAudit({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: 'invite.resent',
      target: invite.id,
      meta: { email: invite.email, role: invite.role },
    });
    return loadDirectory(client, auth.tenant.id, true);
  });

  await sendInviteEmail({
    to: email,
    tenantName: auth.tenant.name,
    acceptUrl: acceptUrl(token, auth.tenant.slug),
  });

  return seats;
}

export async function revokeInvite(auth: MeResponse, inviteId: string): Promise<SeatsResponse> {
  return withTenant(auth.tenant.id, async (client) => {
    const found = await client.query<{
      id: string;
      email: string;
      role: InviteRequest['role'];
      accepted_at: Date | null;
      revoked_at: Date | null;
    }>(
      `SELECT id, email, role, accepted_at, revoked_at FROM invites WHERE id = $1 AND tenant_id = $2`,
      [inviteId, auth.tenant.id]
    );
    const invite = found.rows[0];
    if (!invite) {
      throw new HttpError(404, 'NOT_FOUND', 'Invite not found');
    }
    if (invite.accepted_at) {
      throw new HttpError(400, 'INVITE_USED', 'That invite link has already been used.');
    }
    if (!invite.revoked_at) {
      await client.query(
        `UPDATE invites SET revoked_at = clock_timestamp() WHERE id = $1 AND tenant_id = $2`,
        [inviteId, auth.tenant.id]
      );
      await recordAudit({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: 'invite.revoked',
        target: invite.id,
        meta: { email: invite.email, role: invite.role },
      });
    }
    return loadDirectory(client, auth.tenant.id, true);
  });
}

export async function deactivateMember(auth: MeResponse, membershipId: string): Promise<SeatsResponse> {
  return withTenant(auth.tenant.id, async (client) => {
    await snapshot(client, auth.tenant.id, true);
    const found = await client.query<{
      id: string;
      user_id: string;
      role: SeatMember['role'];
      seat_status: SeatMember['seat_status'];
    }>(
      `SELECT id, user_id, role, seat_status FROM memberships WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [membershipId, auth.tenant.id]
    );
    const membership = found.rows[0];
    if (!membership) {
      throw new HttpError(404, 'NOT_FOUND', 'Member not found');
    }
    if (membership.role === 'owner' && auth.role !== 'owner') {
      throw new HttpError(403, 'FORBIDDEN', 'Only an owner can deactivate an owner');
    }
    if (membership.role === 'owner' && membership.seat_status === 'active') {
      const owners = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM memberships
         WHERE tenant_id = $1 AND role = 'owner' AND seat_status = 'active'`,
        [auth.tenant.id]
      );
      if (Number(owners.rows[0]?.n ?? 0) <= 1) {
        throw new HttpError(409, 'LAST_OWNER', 'The last active owner cannot be deactivated');
      }
    }
    if (membership.seat_status !== 'deactivated') {
      await client.query(
        `UPDATE memberships SET seat_status = 'deactivated' WHERE id = $1 AND tenant_id = $2`,
        [membershipId, auth.tenant.id]
      );
      await revokeSessions(client, membership.user_id, auth.tenant.id);
      await recordAudit({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: 'member.deactivated',
        target: membership.id,
        meta: { user_id: membership.user_id, role: membership.role },
      });
    }
    return loadDirectory(client, auth.tenant.id, true);
  });
}

export async function reactivateMember(auth: MeResponse, membershipId: string): Promise<SeatsResponse> {
  return withTenant(auth.tenant.id, async (client) => {
    const usage = await snapshot(client, auth.tenant.id, true);
    const found = await client.query<{
      id: string;
      user_id: string;
      role: SeatMember['role'];
      seat_status: SeatMember['seat_status'];
    }>(
      `SELECT id, user_id, role, seat_status FROM memberships WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [membershipId, auth.tenant.id]
    );
    const membership = found.rows[0];
    if (!membership) {
      throw new HttpError(404, 'NOT_FOUND', 'Member not found');
    }
    if (membership.role === 'owner' && auth.role !== 'owner') {
      throw new HttpError(403, 'FORBIDDEN', 'Only an owner can reactivate an owner');
    }
    if (membership.seat_status !== 'active') {
      if (seatLimitReached(usage.seats_used, usage.seat_limit)) {
        throw new HttpError(
          409,
          'SEAT_LIMIT_REACHED',
          `All ${usage.seat_limit} seats are in use. Ask your admin.`
        );
      }
      await client.query(
        `UPDATE memberships SET seat_status = 'active' WHERE id = $1 AND tenant_id = $2`,
        [membershipId, auth.tenant.id]
      );
      await recordAudit({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: 'member.reactivated',
        target: membership.id,
        meta: { user_id: membership.user_id, role: membership.role },
      });
    }
    return loadDirectory(client, auth.tenant.id, true);
  });
}
