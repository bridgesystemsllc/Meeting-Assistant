/**
 * Append-only audit helper. Call inside the same withTenant transaction
 * as the action so RLS tenant_isolation applies to the insert.
 *
 * Folds the P2-2/P2-3 recordAudit({ tenantId, actorUserId, action, target, meta })
 * stub into this writer. Prefer passing the PoolClient so seat changes,
 * meeting.deleted, and auth events commit with the action.
 *
 * Later phases should reuse this for branding.updated (P3) and
 * meeting.bot_dispatched (Phase 1 bot send).
 */

import { createHmac } from 'node:crypto';
import type pg from 'pg';
import {
  AuditActionSchema,
  maskEmail,
  sanitizeAuditMetadata,
  type AuditAction,
} from '@meeting-assistant/shared';
import { getOwnerPool, withTenant } from './db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** P2-3 stub shape. `target` is a UUID id or a free-form label. */
export interface AuditEvent {
  tenantId: string;
  actorUserId: string;
  action: string;
  target: string;
  meta?: Record<string, unknown>;
}

export interface AuditEventInput {
  actorUserId?: string | null;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  target?: string;
  metadata?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  email?: string | null;
}

export interface RecordedAuditEvent {
  id: string;
  created_at: Date;
}

function isPoolClient(value: object): value is pg.PoolClient {
  return typeof (value as pg.PoolClient).query === 'function' && typeof (value as pg.PoolClient).release === 'function';
}

function targetTypeFor(action: string): string {
  if (action.startsWith('invite.') || action === 'failed-invite') return 'invite';
  if (action.startsWith('member.')) return 'membership';
  if (action.startsWith('meeting.')) return 'meeting';
  if (action === 'login' || action === 'logout' || action === 'failed-login') return 'user';
  if (action === 'branding.updated') return 'tenant';
  return 'unknown';
}

function hmacEmail(email: string): string {
  const key = process.env.AUDIT_EMAIL_HMAC_KEY;
  if (!key) {
    throw new Error('AUDIT_EMAIL_HMAC_KEY is not set');
  }
  return createHmac('sha256', key).update(email.trim().toLowerCase()).digest('hex');
}

function takeEmail(
  meta: Record<string, unknown>,
  explicit?: string | null
): { email: string | null; meta: Record<string, unknown> } {
  const copy = { ...meta };
  const fromMeta = typeof copy.email === 'string' ? copy.email : null;
  delete copy.email;
  const email = explicit || fromMeta;
  return { email: email && email.length > 0 ? email : null, meta: copy };
}

function normalizeInput(event: AuditEvent | AuditEventInput): AuditEventInput {
  const stub = event as AuditEvent;
  const input = event as AuditEventInput;
  if (typeof stub.target === 'string' && stub.target.length > 0 && input.targetType == null && input.targetId == null) {
    const uuid = UUID_RE.test(stub.target);
    return {
      actorUserId: stub.actorUserId,
      action: stub.action,
      targetType: uuid ? targetTypeFor(stub.action) : 'external',
      targetId: uuid ? stub.target : null,
      metadata: stub.meta ?? {},
      email: typeof stub.meta?.email === 'string' ? stub.meta.email : null,
    };
  }
  return event;
}

async function writeAudit(tx: pg.PoolClient, event: AuditEventInput): Promise<RecordedAuditEvent> {
  const action = AuditActionSchema.parse(event.action);
  const { email, meta } = takeEmail(event.metadata ?? event.meta ?? {}, event.email);
  const metadata = sanitizeAuditMetadata(meta);
  const emailHmac = email ? hmacEmail(email) : null;
  const emailMasked = email ? maskEmail(email) : null;
  const targetId = event.targetId ?? (event.target && UUID_RE.test(event.target) ? event.target : null);
  const targetType = event.targetType ?? (targetId ? targetTypeFor(action) : null);
  const failedCode =
    action === 'failed-invite' && targetId && typeof metadata.code === 'string' && metadata.code.length > 0
      ? metadata.code
      : null;

  const insertSql = failedCode
    ? `INSERT INTO audit_events (
         tenant_id, actor_user_id, action, target_type, target_id,
         metadata, email_hmac, email_masked
       ) VALUES (
         NULLIF(current_setting('app.tenant_id', true), '')::uuid,
         $1, $2, $3, $4, $5::jsonb, $6, $7
       )
       ON CONFLICT (tenant_id, target_id, (metadata->>'code'))
         WHERE action = 'failed-invite' AND target_id IS NOT NULL
       DO NOTHING
       RETURNING id, created_at`
    : `INSERT INTO audit_events (
         tenant_id, actor_user_id, action, target_type, target_id,
         metadata, email_hmac, email_masked
       ) VALUES (
         NULLIF(current_setting('app.tenant_id', true), '')::uuid,
         $1, $2, $3, $4, $5::jsonb, $6, $7
       )
       RETURNING id, created_at`;

  const result = await tx.query<RecordedAuditEvent>(insertSql, [
    event.actorUserId ?? null,
    action,
    targetType,
    targetId,
    JSON.stringify(metadata),
    emailHmac,
    emailMasked,
  ]);
  if (result.rows[0]) {
    return result.rows[0];
  }
  if (failedCode && targetId) {
    const existing = await tx.query<RecordedAuditEvent>(
      `SELECT id, created_at
         FROM audit_events
        WHERE action = 'failed-invite'
          AND target_id = $1
          AND metadata->>'code' = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
      [targetId, failedCode]
    );
    if (existing.rows[0]) {
      return existing.rows[0];
    }
  }
  throw new Error('audit_events insert returned no row');
}

export async function recordAudit(event: AuditEvent): Promise<void>;
export async function recordAudit(
  tx: pg.PoolClient,
  event: AuditEventInput | AuditEvent
): Promise<RecordedAuditEvent>;
export async function recordAudit(
  txOrEvent: pg.PoolClient | AuditEvent,
  event?: AuditEventInput | AuditEvent
): Promise<RecordedAuditEvent | void> {
  if (!isPoolClient(txOrEvent)) {
    await withTenant(txOrEvent.tenantId, (tx) => writeAudit(tx, normalizeInput(txOrEvent)));
    return;
  }
  if (!event) {
    throw new Error('recordAudit requires an event');
  }
  return writeAudit(txOrEvent, normalizeInput(event));
}

/** Owner-only tenant offboarding. App role cannot execute the SQL function. */
export async function purgeAuditTenant(tenantId: string): Promise<number> {
  const result = await getOwnerPool().query<{ n: number | string }>('SELECT purge_audit_tenant($1) AS n', [
    tenantId,
  ]);
  return Number(result.rows[0]?.n ?? 0);
}

/** Owner-only user erasure. Nulls actor_user_id and drops user-target rows. */
export async function purgeAuditUser(userId: string): Promise<number> {
  let emailHmac: string | null = null;
  const user = await getOwnerPool().query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
    userId,
  ]);
  if (user.rows[0]?.email) {
    emailHmac = hmacEmail(user.rows[0].email);
  }
  const result = await getOwnerPool().query<{ n: number | string }>('SELECT purge_audit_user($1, $2) AS n', [
    userId,
    emailHmac,
  ]);
  return Number(result.rows[0]?.n ?? 0);
}
