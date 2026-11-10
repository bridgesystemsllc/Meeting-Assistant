import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import { applyAuthEnv, startPostgresManagedOwner } from '../test/harness.js';
import { getOwnerPool, resetPools, withTenant } from '../lib/db.js';
import { issueSession } from '../lib/session.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';
import { lookupUserContact } from '../lib/tenant-lookup.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const ACME_MEETING = '10000000-0000-0000-0000-0000000000aa';

describe('non-superuser non-BYPASSRLS owner', () => {
  let container: { stop: () => Promise<unknown> };
  let app: Express;

  beforeAll(async () => {
    const pgStack = await startPostgresManagedOwner();
    container = pgStack.container;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: 'http://127.0.0.1:0/mock-oidc',
    });
    await resetPools();

    const owner = await ownerQuery<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    );
    expect(owner.rows[0].rolsuper).toBe(false);
    expect(owner.rows[0].rolbypassrls).toBe(false);

    await ownerQuery(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status, recall_bot_id)
       VALUES ($1, $2, $3, 'Acme standup', 'meet', 'https://meet.google.com/aaa-bbbb-ccc', 'completed', 'bot-acme-notes-1')`,
      [ACME_MEETING, ACME, ACME_OWNER]
    );

    const { createApp } = await import('../app.js');
    app = createApp();
  }, 120_000);

  afterAll(async () => {
    await resetPools();
    await container.stop();
  }, 60_000);

  async function ownerQuery<T extends pg.QueryResultRow>(text: string, params?: unknown[]) {
    return getOwnerPool().query<T>(text, params);
  }

  it('keeps FORCE RLS on tenant tables and lets SECURITY DEFINER lookups work', async () => {
    const meetings = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'meetings'`
    );
    expect(meetings.rows[0].force_rls).toBe(true);

    const users = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'users'`
    );
    expect(users.rows[0].force_rls).toBe(true);

    const identities = await ownerQuery<{ force_rls: boolean }>(
      `SELECT c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'user_identities'`
    );
    expect(identities.rows[0].force_rls).toBe(true);

    const contact = await lookupUserContact(ACME_OWNER, ACME);
    expect(contact?.email).toBe('owner@example.com');
  });

  it('serves tenant-scoped meetings over the request path', async () => {
    const { token } = await issueSession({ userId: ACME_OWNER, activeTenantId: ACME });
    const res = await request(app)
      .get('/api/v1/meetings')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meetings.map((m: { id: string }) => m.id)).toEqual([ACME_MEETING]);

    await withTenant(ACME, async (client) => {
      const rows = await client.query('SELECT id FROM meetings');
      expect(rows.rows.map((r) => r.id)).toEqual([ACME_MEETING]);
    });
  });
});
