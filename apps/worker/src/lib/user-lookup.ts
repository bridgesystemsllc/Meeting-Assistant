/**
 * SECURITY DEFINER lookup for the meeting owner contact.
 * FORGE process-meeting must use this instead of `SELECT ... FROM users`.
 */

import { db } from './db.js';

export async function lookupUserContact(
  userId: string
): Promise<{ id: string; email: string; name: string | null } | null> {
  const result = await db.query<{
    lookup_user_contact: { id: string; email: string; name: string | null } | null;
  }>('SELECT lookup_user_contact($1) AS lookup_user_contact', [userId]);
  return result.rows[0]?.lookup_user_contact ?? null;
}
