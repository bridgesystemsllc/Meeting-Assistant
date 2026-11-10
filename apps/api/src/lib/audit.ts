/**
 * Append-only audit helper. Call inside the same withTenant transaction
 * as the action so RLS tenant_isolation applies to the insert.
 *
 * Later phases should reuse this for branding.updated (P3) and
 * meeting.bot_dispatched (Phase 1 bot send).
 */

import type pg from 'pg';
import {
  AuditActionSchema,
  sanitizeAuditMetadata,
  type AuditAction,
} from '@meeting-assistant/shared';

export interface AuditEventInput {
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordedAuditEvent {
  id: string;
  created_at: Date;
}

export async function recordAudit(
  tx: pg.PoolClient,
  event: AuditEventInput
): Promise<RecordedAuditEvent> {
  const action = AuditActionSchema.parse(event.action);
  const metadata = sanitizeAuditMetadata(event.metadata ?? {});
  const result = await tx.query<RecordedAuditEvent>(
    `INSERT INTO audit_events (
       tenant_id, actor_user_id, action, target_type, target_id, metadata
     ) VALUES (
       NULLIF(current_setting('app.tenant_id', true), '')::uuid,
       $1, $2, $3, $4, $5::jsonb
     )
     RETURNING id, created_at`,
    [
      event.actorUserId ?? null,
      action,
      event.targetType ?? null,
      event.targetId ?? null,
      JSON.stringify(metadata),
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('audit_events insert returned no row');
  }
  return row;
}
