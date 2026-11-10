/**
 * Narrow SECURITY DEFINER lookups for webhooks and jobs.
 * FORGE Phase 1 (PR #3) must call these instead of querying meetings /
 * webhook_events / users directly as the app role.
 */

import type pg from 'pg';
import { db, withTenant } from './db.js';

export interface ResolvedMeetingTenant {
  ok: true;
  tenant_id: string;
  meeting_id: string;
}

export interface FailedMeetingTenant {
  ok: false;
  code: 'NOT_FOUND' | 'TENANT_MISMATCH';
}

export type MeetingTenantResult = ResolvedMeetingTenant | FailedMeetingTenant;

export async function resolveMeetingTenant(params: {
  recallBotId?: string | null;
  claimedTenantId?: string | null;
  claimedMeetingId?: string | null;
}): Promise<MeetingTenantResult> {
  const result = await db.query<{ resolve_meeting_tenant: MeetingTenantResult }>(
    'SELECT resolve_meeting_tenant($1,$2,$3) AS resolve_meeting_tenant',
    [
      params.recallBotId ?? null,
      params.claimedTenantId ?? null,
      params.claimedMeetingId ?? null,
    ]
  );
  return result.rows[0].resolve_meeting_tenant;
}

export async function webhookEventExists(
  recallBotId: string,
  eventType: string,
  eventId: string
): Promise<boolean> {
  const result = await db.query<{ webhook_event_exists: boolean }>(
    'SELECT webhook_event_exists($1,$2,$3) AS webhook_event_exists',
    [recallBotId, eventType, eventId]
  );
  return result.rows[0]?.webhook_event_exists === true;
}

/** Returns true when the event was newly recorded; false on duplicate. */
export async function webhookInsertEvent(
  recallBotId: string,
  eventType: string,
  eventId: string,
  payload: unknown
): Promise<boolean> {
  const result = await db.query<{ webhook_insert_event: boolean }>(
    'SELECT webhook_insert_event($1,$2,$3,$4) AS webhook_insert_event',
    [recallBotId, eventType, eventId, payload ?? null]
  );
  return result.rows[0]?.webhook_insert_event === true;
}

export async function webhookMarkProcessed(
  recallBotId: string,
  eventType: string,
  eventId: string
): Promise<void> {
  await db.query('SELECT webhook_mark_processed($1,$2,$3)', [recallBotId, eventType, eventId]);
}

type SqlQuery = {
  query: <T extends pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
};

async function readUserContact(
  queryable: SqlQuery,
  userId: string
): Promise<{ email: string; name: string | null } | null> {
  const result = await queryable.query<{
    lookup_user_contact: { email: string; name: string | null } | null;
  }>('SELECT lookup_user_contact($1) AS lookup_user_contact', [userId]);
  return result.rows[0]?.lookup_user_contact ?? null;
}

/** Tenant-scoped via app.tenant_id. Omit tenantId to query with no session tenant. */
export async function lookupUserContact(
  userId: string,
  tenantId?: string | null
): Promise<{ email: string; name: string | null } | null> {
  if (!tenantId) {
    return readUserContact(db, userId);
  }
  return withTenant(tenantId, (client) => readUserContact(client, userId));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  const text = asString(value);
  return text && UUID_RE.test(text) ? text : null;
}

/**
 * Pull Recall bot id + claimed tenant/meeting from a webhook payload.
 * Spec §5.1: payload.data.bot.id and payload.data.bot.metadata.{tenant_id, meeting_id}.
 */
export function parseRecallWebhookCorrelation(payload: unknown): {
  recallBotId: string | null;
  claimedTenantId: string | null;
  claimedMeetingId: string | null;
  event: string | null;
} {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  const bot = asRecord(data?.bot) ?? asRecord(data);
  const metadata = asRecord(bot?.metadata);
  return {
    recallBotId: asString(bot?.id),
    claimedTenantId: asUuid(metadata?.tenant_id),
    claimedMeetingId: asUuid(metadata?.meeting_id) ?? asUuid(metadata?.internal_meeting_id),
    event: asString(body?.event),
  };
}
