/**
 * SECURITY DEFINER lookup for the meeting owner contact.
 * FORGE process-meeting must use this instead of `SELECT ... FROM users`.
 */

import type pg from 'pg';
import { db, withTenant } from './db.js';

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
