/**
 * Admin activity feed. Reads audit_events under withTenant.
 */

import type pg from 'pg';
import {
  ActivityListResponseSchema,
  ActivityQuerySchema,
  type ActivityItem,
  type ActivityListResponse,
  type ActivityQuery,
  type MeResponse,
} from '@meeting-assistant/shared';
import { withTenant } from '../lib/db.js';
import { HttpError } from '../lib/http-error.js';

const ISO = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid');
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid activity cursor');
  }
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseActivityQuery(input: Record<string, unknown>): ActivityQuery {
  const parsed = ActivityQuerySchema.safeParse({
    limit: input.limit,
    cursor: optionalString(input.cursor),
    action: optionalString(input.action),
  });
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid activity query');
  }
  return parsed.data;
}

interface UserContact {
  id: string;
  email: string;
  name: string | null;
}

async function loadActors(
  client: pg.PoolClient,
  userIds: string[]
): Promise<Map<string, UserContact>> {
  if (userIds.length === 0) return new Map();
  const contactsResult = await client.query<{ lookup_users_contact: UserContact[] | null }>(
    'SELECT lookup_users_contact($1) AS lookup_users_contact',
    [userIds]
  );
  return new Map((contactsResult.rows[0]?.lookup_users_contact ?? []).map((user) => [user.id, user]));
}

export async function listActivity(auth: MeResponse, query: ActivityQuery): Promise<ActivityListResponse> {
  return withTenant(auth.tenant.id, async (client) => {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await client.query<{
      id: string;
      actor_user_id: string | null;
      action: ActivityItem['action'];
      target_type: string | null;
      target_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: Date | string;
    }>(
      `SELECT id, actor_user_id, action, target_type, target_id, metadata, created_at
       FROM audit_events
       WHERE ($1::text IS NULL OR action = $1)
         AND (
           $2::timestamptz IS NULL
           OR created_at < $2::timestamptz
           OR (created_at = $2::timestamptz AND id < $3::uuid)
         )
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [query.action ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, query.limit + 1]
    );

    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const actorIds = [...new Set(rows.map((row) => row.actor_user_id).filter((id): id is string => Boolean(id)))];
    const actors = await loadActors(client, actorIds);

    const items: ActivityItem[] = rows.map((row) => {
      const actorRow = row.actor_user_id ? actors.get(row.actor_user_id) : undefined;
      return {
        id: row.id,
        created_at: ISO(row.created_at),
        action: row.action,
        actor: actorRow
          ? { id: actorRow.id, name: actorRow.name, email: actorRow.email }
          : null,
        target_type: row.target_type,
        target_id: row.target_id,
        metadata: row.metadata ?? {},
      };
    });

    const last = items[items.length - 1];
    return ActivityListResponseSchema.parse({
      items,
      nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
    });
  });
}
