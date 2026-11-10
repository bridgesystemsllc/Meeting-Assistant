import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import pg from 'pg';
import { GLOBAL_TABLES, isGlobalTable } from '@meeting-assistant/shared';
import { applyAuthEnv, startPostgres } from '../test/harness.js';
import { getAppPool, getOwnerPool, resetPools, withTenant } from '../lib/db.js';
import { issueSession } from '../lib/session.js';
import { SESSION_COOKIE_NAME } from '../lib/session-cookie.js';
import {
  lookupUserContact,
  resolveMeetingTenant,
  webhookEventExists,
  webhookInsertEvent,
} from '../lib/tenant-lookup.js';
import * as webhookVerify from '../services/webhook-verify.js';

const ACME = '00000000-0000-0000-0000-000000000010';
const LUMEN = '00000000-0000-0000-0000-000000000001';
const ACME_OWNER = '00000000-0000-0000-0000-000000000011';
const ACME_ADMIN = '00000000-0000-0000-0000-000000000012';
const ACME_MEMBER = '00000000-0000-0000-0000-000000000013';
const LUMEN_OWNER = '00000000-0000-0000-0000-000000000002';
const ACME_MEETING = '10000000-0000-0000-0000-0000000000aa';
const LUMEN_MEETING = '10000000-0000-0000-0000-0000000000bb';
const ACME_BOT = 'bot-acme-notes-1';
const LUMEN_BOT = 'bot-lumen-vale-1';

const TENANT_TABLES_WITH_MEETING_FK = ['transcripts', 'meeting_analysis', 'email_deliveries'] as const;

describe('RLS tenant isolation', () => {
  let container: { stop: () => Promise<unknown> };
  let app: Express;

  beforeAll(async () => {
    const pgStack = await startPostgres();
    container = pgStack.container;
    applyAuthEnv({
      ownerUrl: pgStack.ownerUrl,
      appUrl: pgStack.appUrl,
      issuerUrl: 'http://127.0.0.1:0/mock-oidc',
    });
    await resetPools();
    await seedMeetings();
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

  async function seedMeetings() {
    await ownerQuery(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status, recall_bot_id)
       VALUES
         ($1, $2, $3, 'Acme standup', 'meet', 'https://meet.google.com/aaa-bbbb-ccc', 'completed', $4),
         ($5, $6, $7, 'Lumen QBR', 'zoom', 'https://zoom.us/j/5551112222', 'completed', $8)`,
      [ACME_MEETING, ACME, ACME_OWNER, ACME_BOT, LUMEN_MEETING, LUMEN, LUMEN_OWNER, LUMEN_BOT]
    );

    for (const meeting of [
      { id: ACME_MEETING, tenant: ACME },
      { id: LUMEN_MEETING, tenant: LUMEN },
    ]) {
      await ownerQuery(
        `INSERT INTO transcripts (tenant_id, meeting_id, full_text, word_count)
         VALUES ($1, $2, 'synthetic transcript', 2)`,
        [meeting.tenant, meeting.id]
      );
      await ownerQuery(
        `INSERT INTO meeting_analysis (tenant_id, meeting_id, summary)
         VALUES ($1, $2, 'synthetic summary')`,
        [meeting.tenant, meeting.id]
      );
      await ownerQuery(
        `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, status)
         VALUES ($1, $2, 'owner@example.com', 'sent')`,
        [meeting.tenant, meeting.id]
      );
    }

    await ownerQuery(
      `INSERT INTO invites (tenant_id, email, role, token_hash, expires_at)
       VALUES
         ($1, 'new-acme@example.com', 'member', 'hash-acme', NOW() + INTERVAL '1 day'),
         ($2, 'new-lumen@example.com', 'member', 'hash-lumen', NOW() + INTERVAL '1 day')`,
      [ACME, LUMEN]
    );
  }

  async function cookieFor(userId: string, tenantId: string): Promise<string> {
    const { token } = await issueSession({ userId, activeTenantId: tenantId });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  it('fails CI when a non-exempt public table lacks tenant_id or FORCE RLS', async () => {
    const tables = await ownerQuery<{ table_name: string; rls: boolean; force_rls: boolean }>(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );

    const names = tables.rows.map((r) => r.table_name).sort();
    for (const global of GLOBAL_TABLES) {
      expect(names).toContain(global);
    }

    const missing: string[] = [];
    for (const row of tables.rows) {
      if (isGlobalTable(row.table_name)) {
        expect(row.rls, `${row.table_name} should ENABLE RLS`).toBe(true);
        expect(row.force_rls, `${row.table_name} global must FORCE RLS (004 definer policies)`).toBe(
          true
        );
        continue;
      }
      const col = await ownerQuery<{ is_nullable: string }>(
        `SELECT is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
        [row.table_name]
      );
      if (col.rowCount !== 1 || col.rows[0].is_nullable !== 'NO' || !row.rls || !row.force_rls) {
        missing.push(row.table_name);
      }
    }

    expect(missing, `non-exempt tables missing tenant_id NOT NULL or FORCE RLS: ${missing.join(', ')}`).toEqual(
      []
    );
  });

  it('lets tenant A see only its own rows on every tenant table', async () => {
    await withTenant(ACME, async (client) => {
      const meetings = await client.query('SELECT id FROM meetings ORDER BY title');
      expect(meetings.rows.map((r) => r.id)).toEqual([ACME_MEETING]);

      for (const table of TENANT_TABLES_WITH_MEETING_FK) {
        const rows = await client.query<{ meeting_id: string }>(`SELECT meeting_id FROM ${table}`);
        expect(rows.rows.map((r) => r.meeting_id), table).toEqual([ACME_MEETING]);
      }

      const settings = await client.query('SELECT tenant_id FROM tenant_settings');
      expect(settings.rows.map((r) => r.tenant_id)).toEqual([ACME]);

      const memberships = await client.query('SELECT tenant_id FROM memberships');
      expect(memberships.rows.every((r) => r.tenant_id === ACME)).toBe(true);
      expect(memberships.rowCount).toBeGreaterThan(0);

      const invites = await client.query('SELECT email FROM invites');
      expect(invites.rows.map((r) => r.email)).toEqual(['new-acme@example.com']);
    });
  });

  it('blocks tenant B from reading, updating, or deleting tenant A rows', async () => {
    await withTenant(LUMEN, async (client) => {
      const read = await client.query('SELECT id FROM meetings WHERE id = $1', [ACME_MEETING]);
      expect(read.rowCount).toBe(0);

      const updated = await client.query('UPDATE meetings SET title = $1 WHERE id = $2', [
        'hijacked',
        ACME_MEETING,
      ]);
      expect(updated.rowCount).toBe(0);

      const deleted = await client.query('DELETE FROM meetings WHERE id = $1', [ACME_MEETING]);
      expect(deleted.rowCount).toBe(0);

      for (const table of TENANT_TABLES_WITH_MEETING_FK) {
        const rows = await client.query(`SELECT 1 FROM ${table} WHERE meeting_id = $1`, [ACME_MEETING]);
        expect(rows.rowCount, table).toBe(0);
      }
    });

    const stillThere = await ownerQuery('SELECT title FROM meetings WHERE id = $1', [ACME_MEETING]);
    expect(stillThere.rows[0].title).toBe('Acme standup');
  });

  it('WITH CHECK rejects inserting another tenant id while in tenant context', async () => {
    await withTenant(ACME, async (client) => {
      await expect(
        client.query(
          `INSERT INTO meetings (tenant_id, user_id, title, platform, meeting_url, status)
           VALUES ($1, $2, 'cross write', 'zoom', 'https://zoom.us/j/1', 'scheduled')`,
          [LUMEN, ACME_OWNER]
        )
      ).rejects.toThrow(/row-level security/i);
    });
  });

  it('returns zero rows when no app.tenant_id is set', async () => {
    const meetings = await getAppPool().query('SELECT id FROM meetings');
    expect(meetings.rowCount).toBe(0);
    const transcripts = await getAppPool().query('SELECT id FROM transcripts');
    expect(transcripts.rowCount).toBe(0);
    const settings = await getAppPool().query('SELECT tenant_id FROM tenant_settings');
    expect(settings.rowCount).toBe(0);

    await expect(
      getAppPool().query(
        `INSERT INTO meetings (tenant_id, user_id, title, platform, meeting_url, status)
         VALUES ($1, $2, 'no context', 'zoom', 'https://zoom.us/j/1', 'scheduled')`,
        [ACME, ACME_OWNER]
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it('errors when the app role queries a global table directly', async () => {
    await expect(getAppPool().query('SELECT * FROM users')).rejects.toThrow();
    await expect(getAppPool().query('SELECT * FROM webhook_events')).rejects.toThrow();
    await expect(getAppPool().query('SELECT * FROM tenants')).rejects.toThrow();
  });

  it('lookup_user_contact is tenant-scoped', async () => {
    const sameTenant = await lookupUserContact(ACME_OWNER, ACME);
    expect(sameTenant).toEqual({ email: 'owner@example.com', name: 'Avery Owner' });
    expect(sameTenant).not.toHaveProperty('id');

    const crossTenant = await lookupUserContact(ACME_OWNER, LUMEN);
    expect(crossTenant).toBeNull();

    const noTenant = await lookupUserContact(ACME_OWNER);
    expect(noTenant).toBeNull();
  });

  it('clears app.tenant_id on the pooled connection after commit', async () => {
    await withTenant(ACME, async (client) => {
      const inside = await client.query("SELECT current_setting('app.tenant_id', true) AS t");
      expect(inside.rows[0].t).toBe(ACME);
    });
    const client = await getAppPool().connect();
    try {
      const after = await client.query("SELECT current_setting('app.tenant_id', true) AS t");
      expect(after.rows[0].t === null || after.rows[0].t === '').toBe(true);
    } finally {
      client.release();
    }
  });

  it('a job running as the wrong tenant cannot touch other rows', async () => {
    await withTenant(LUMEN, async (client) => {
      const updated = await client.query(
        "UPDATE meetings SET status = 'failed' WHERE id = $1",
        [ACME_MEETING]
      );
      expect(updated.rowCount).toBe(0);
    });
    const row = await ownerQuery<{ status: string }>('SELECT status FROM meetings WHERE id = $1', [
      ACME_MEETING,
    ]);
    expect(row.rows[0].status).toBe('completed');
  });

  it('returns 404, not 403, when tenant A requests tenant B meeting via API', async () => {
    const cookie = await cookieFor(ACME_OWNER, ACME);
    const cross = await request(app)
      .get(`/api/v1/meetings/${LUMEN_MEETING}`)
      .set('Cookie', cookie);
    expect(cross.status).toBe(404);
    expect(cross.body.error.code).toBe('NOT_FOUND');
    expect(cross.status).not.toBe(403);

    const own = await request(app).get(`/api/v1/meetings/${ACME_MEETING}`).set('Cookie', cookie);
    expect(own.status).toBe(200);
    expect(own.body.meeting.id).toBe(ACME_MEETING);

    const list = await request(app).get('/api/v1/meetings').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.meetings.map((m: { id: string }) => m.id)).toEqual([ACME_MEETING]);

    const del = await request(app)
      .delete(`/api/v1/meetings/${LUMEN_MEETING}`)
      .set('Cookie', cookie);
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe('NOT_FOUND');

    const lumenStill = await ownerQuery('SELECT id FROM meetings WHERE id = $1', [LUMEN_MEETING]);
    expect(lumenStill.rowCount).toBe(1);
  });

  it('resolves webhook tenant without leaking ids on mismatch', async () => {
    const ok = await resolveMeetingTenant({
      recallBotId: ACME_BOT,
      claimedTenantId: ACME,
      claimedMeetingId: ACME_MEETING,
    });
    expect(ok).toMatchObject({ ok: true, tenant_id: ACME, meeting_id: ACME_MEETING });

    const mismatch = await resolveMeetingTenant({
      recallBotId: ACME_BOT,
      claimedTenantId: LUMEN,
    });
    expect(mismatch).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(mismatch).not.toHaveProperty('tenant_id');
    expect(mismatch).not.toHaveProperty('meeting_id');

    const unclaimed = await resolveMeetingTenant({
      recallBotId: ACME_BOT,
      claimedMeetingId: ACME_MEETING,
    });
    expect(unclaimed).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(unclaimed).not.toHaveProperty('tenant_id');
    expect(unclaimed).not.toHaveProperty('meeting_id');

    const missing = await resolveMeetingTenant({
      recallBotId: 'bot-does-not-exist',
      claimedTenantId: ACME,
    });
    expect(missing).toEqual(mismatch);
  });

  it('rejects unsigned webhooks with 400 BAD_SIGNATURE and writes nothing', async () => {
    const before = await ownerQuery<{ n: string }>(
      'SELECT count(*)::text AS n FROM webhook_events'
    );
    const unsigned = await request(app)
      .post('/webhooks/recall')
      .send({
        event: 'bot.done',
        data: { bot: { id: ACME_BOT, metadata: { tenant_id: ACME, meeting_id: ACME_MEETING } } },
      });
    expect(unsigned.status).toBe(400);
    expect(unsigned.body.error.code).toBe('BAD_SIGNATURE');

    const mismatchShape = await request(app)
      .post('/webhooks/recall')
      .send({
        event: 'bot.done',
        data: {
          bot: {
            id: ACME_BOT,
            metadata: { tenant_id: LUMEN, meeting_id: ACME_MEETING },
          },
        },
      });
    expect(mismatchShape.status).toBe(400);
    expect(mismatchShape.body.error.code).toBe('BAD_SIGNATURE');

    const after = await ownerQuery<{ n: string }>(
      'SELECT count(*)::text AS n FROM webhook_events'
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('after a valid signature, matching and mismatch both return 200 received', async () => {
    process.env.RECALL_WEBHOOK_SECRET = 'whsec_test';
    const spy = vi.spyOn(webhookVerify, 'createWebhookVerifier').mockReturnValue((_rawBody, headers) => {
      const id = headers['svix-id'] || 'svix_test';
      return { valid: true, id };
    });

    try {
      const matching = await request(app)
        .post('/webhooks/recall')
        .set('svix-id', 'svix_test_1')
        .set('svix-timestamp', '1')
        .set('svix-signature', 'v1,test')
        .send({
          event: 'bot.done',
          data: { bot: { id: ACME_BOT, metadata: { tenant_id: ACME, meeting_id: ACME_MEETING } } },
        });
      expect(matching.status).toBe(200);
      expect(matching.body).toEqual({ received: true });
      expect(await webhookEventExists(ACME_BOT, 'bot.done', 'svix_test_1')).toBe(true);

      const mismatch = await request(app)
        .post('/webhooks/recall')
        .set('svix-id', 'svix_test_2')
        .send({
          event: 'bot.done',
          data: {
            bot: {
              id: ACME_BOT,
              metadata: { tenant_id: LUMEN, meeting_id: ACME_MEETING },
            },
          },
        });
      expect(mismatch.status).toBe(200);
      expect(mismatch.body).toEqual({ received: true });
      expect(mismatch.body.error).toBeUndefined();
      expect(await webhookEventExists(ACME_BOT, 'bot.done', 'svix_test_2')).toBe(false);
    } finally {
      spy.mockRestore();
      delete process.env.RECALL_WEBHOOK_SECRET;
    }
  });

  it('records webhook events through SECURITY DEFINER, not direct table access', async () => {
    const inserted = await webhookInsertEvent(ACME_BOT, 'bot.done', 'evt-1', { event: 'bot.done' });
    expect(inserted).toBe(true);
    const duplicate = await webhookInsertEvent(ACME_BOT, 'bot.done', 'evt-1', { event: 'bot.done' });
    expect(duplicate).toBe(false);
    expect(await webhookEventExists(ACME_BOT, 'bot.done', 'evt-1')).toBe(true);
  });

  it('rejects a same-tenant FK squat onto another tenant meeting', async () => {
    await withTenant(ACME, async (client) => {
      await expect(
        client.query(
          `INSERT INTO email_deliveries (tenant_id, meeting_id, recipient_email, status)
           VALUES ($1, $2, 'attacker@example.com', 'pending')`,
          [ACME, LUMEN_MEETING]
        )
      ).rejects.toThrow(/foreign key|violates/i);
    });
  });

  it('enforces UNIQUE (tenant_id, id) on meetings', async () => {
    const constraint = await ownerQuery<{ conname: string }>(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'meetings' AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%tenant_id%'`
    );
    expect(constraint.rowCount).toBeGreaterThan(0);
  });

  it('DELETE requires admin/owner or the meeting owner, and 404s cross-tenant', async () => {
    const memberMeeting = '10000000-0000-0000-0000-0000000000cc';
    const adminMeeting = '10000000-0000-0000-0000-0000000000dd';
    await ownerQuery(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
       VALUES
         ($1, $2, $3, 'member owned', 'zoom', 'https://zoom.us/j/1', 'completed'),
         ($4, $2, $5, 'admin target', 'zoom', 'https://zoom.us/j/2', 'completed')`,
      [memberMeeting, ACME, ACME_MEMBER, adminMeeting, ACME_OWNER]
    );

    const memberCookie = await cookieFor(ACME_MEMBER, ACME);
    const ownerCookie = await cookieFor(ACME_OWNER, ACME);
    const adminCookie = await cookieFor(ACME_ADMIN, ACME);

    const memberDenied = await request(app)
      .delete(`/api/v1/meetings/${ACME_MEETING}`)
      .set('Cookie', memberCookie);
    expect(memberDenied.status).toBe(403);
    expect(memberDenied.body.error.code).toBe('FORBIDDEN');

    const memberOwn = await request(app)
      .delete(`/api/v1/meetings/${memberMeeting}`)
      .set('Cookie', memberCookie);
    expect(memberOwn.status).toBe(204);

    const ownerOwned = '10000000-0000-0000-0000-0000000000ee';
    await ownerQuery(
      `INSERT INTO meetings (id, tenant_id, user_id, title, platform, meeting_url, status)
       VALUES ($1, $2, $3, 'owner owned', 'zoom', 'https://zoom.us/j/3', 'completed')`,
      [ownerOwned, ACME, ACME_OWNER]
    );
    const ownerOwn = await request(app)
      .delete(`/api/v1/meetings/${ownerOwned}`)
      .set('Cookie', ownerCookie);
    expect(ownerOwn.status).toBe(204);

    const adminDel = await request(app)
      .delete(`/api/v1/meetings/${adminMeeting}`)
      .set('Cookie', adminCookie);
    expect(adminDel.status).toBe(204);

    const ownerCross = await request(app)
      .delete(`/api/v1/meetings/${LUMEN_MEETING}`)
      .set('Cookie', ownerCookie);
    expect(ownerCross.status).toBe(404);

    const stillAcme = await ownerQuery('SELECT id FROM meetings WHERE id = $1', [ACME_MEETING]);
    expect(stillAcme.rowCount).toBe(1);
    const lumenStill = await ownerQuery('SELECT id FROM meetings WHERE id = $1', [LUMEN_MEETING]);
    expect(lumenStill.rowCount).toBe(1);
  });
});
