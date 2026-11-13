/**
 * Consent P0 HTTP integration tests (WO-MA-CONSENT-P0).
 * Synthetic seed users only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { EmailMessage } from '@meeting-assistant/shared';
import pg from 'pg';
import crypto from 'node:crypto';
import {
  applyAuthEnv,
  configureMockUser,
  startMockOidc,
  startPostgres,
  type TestStack,
} from '../test/harness.js';
import { resetPools } from '../lib/db.js';
import { clearOidcCache } from '../lib/oidc.js';
import { createCapturingEmailAdapter, setEmailAdapter } from '../lib/email.js';
import { createSignature } from '../services/webhook-verify.js';
import { recallService } from '../services/recall.js';

vi.mock('../services/recall.js', () => ({
  recallService: {
    createBot: vi.fn(async ({ botName, meetingId }: { botName: string; meetingId: string }) => ({
      id: `bot-${meetingId.replace(/-/g, '').slice(0, 12)}`,
      status_changes: [],
      metadata: { botName },
    })),
    sendChatMessage: vi.fn(async () => true),
    leaveMeeting: vi.fn(async () => undefined),
    deleteRecording: vi.fn(async () => undefined),
    deleteTranscript: vi.fn(async () => undefined),
    removeBot: vi.fn(async () => undefined),
  },
}));

const ACME = '00000000-0000-0000-0000-000000000010';
const WEBHOOK_SECRET = 'whsec_test_secret_for_ci';

describe('consent P0 integration', () => {
  let stack: Omit<TestStack, 'mockOidc' | 'issuerUrl'> & {
    mockOidc: Awaited<ReturnType<typeof startMockOidc>>['server'];
    issuerUrl: string;
  };
  let apiPort: number;
  let apiServer: { close: () => Promise<void> } | undefined;
  const inbox: EmailMessage[] = [];

  beforeAll(async () => {
    const pgStack = await startPostgres();
    const mock = await startMockOidc();
    stack = { ...pgStack, mockOidc: mock.server, issuerUrl: mock.issuerUrl };
    applyAuthEnv({ ownerUrl: pgStack.ownerUrl, appUrl: pgStack.appUrl, issuerUrl: mock.issuerUrl });
    process.env.PG_POOL_MAX = '4';
    process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
    process.env.RECALL_WEBHOOK_SECRET = WEBHOOK_SECRET;
    delete process.env.BOT_NAME;
    await resetPools();
    clearOidcCache();
    setEmailAdapter(createCapturingEmailAdapter(inbox));

    const { createApp } = await import('../app.js');
    apiServer = await new Promise((resolve) => {
      const server = createApp().listen(0, '127.0.0.1', () => {
        const addr = server.address();
        apiPort = typeof addr === 'object' && addr ? addr.port : 0;
        process.env.OIDC_REDIRECT_BASE = `http://127.0.0.1:${apiPort}`;
        resolve({
          close: () =>
            new Promise<void>((r, j) => {
              server.close((err) => (err ? j(err) : r()));
            }),
        });
      });
    });
  }, 120_000);

  afterAll(async () => {
    await apiServer?.close();
    await stack?.mockOidc.stop();
    await resetPools();
    await stack?.container.stop();
  }, 60_000);

  beforeEach(() => {
    inbox.length = 0;
    vi.mocked(recallService.createBot).mockClear();
    vi.mocked(recallService.sendChatMessage).mockClear();
    delete process.env.BOT_NAME;
  });

  function origin(): string {
    return `http://127.0.0.1:${apiPort}`;
  }

  async function login(email: string, name: string) {
    clearOidcCache();
    configureMockUser(stack.mockOidc, { email, name });
    const agent = request.agent(origin());
    const start = await agent.get('/api/v1/auth/login/google').redirects(0);
    const idp = await fetch(start.headers.location as string, { redirect: 'manual' });
    const callback = new URL(idp.headers.get('location')!);
    const done = await agent.get(callback.pathname + callback.search).redirects(0);
    expect(done.status).toBe(302);
    return agent;
  }

  it('item 1 + e2e: POST /meetings joins with the tenant bot display name', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const saved = await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Notetaker',
    });
    expect(saved.status).toBe(200);

    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111222',
      title: 'Consent join e2e',
    });
    expect(created.status).toBe(201);
    expect(created.body.meeting.bot_name).toBe('Acme Notetaker');
    expect(vi.mocked(recallService.createBot)).toHaveBeenCalledWith(
      expect.objectContaining({
        botName: 'Acme Notetaker',
        tenantId: ACME,
        meetingUrl: 'https://zoom.us/j/555111222',
      })
    );
  });

  it('item 1: env BOT_NAME is only the fallback default when the tenant has no name', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Notetaker',
    });
    process.env.BOT_NAME = 'Env Recorder';
    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111223',
      title: 'Tenant name wins',
    });
    expect(created.status).toBe(201);
    expect(created.body.meeting.bot_name).toBe('Acme Notetaker');
  });

  it('item 2: a non-disclosing bot name is rejected with BOT_NAME_NOT_DISCLOSING on settings save', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const res = await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Company Bot',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BOT_NAME_NOT_DISCLOSING');
  });

  it('item 2: a non-disclosing fallback BOT_NAME is rejected on join', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const client = new pg.Client({ connectionString: stack.ownerUrl });
    await client.connect();
    try {
      await client.query(
        `UPDATE tenant_settings SET bot_display_name = NULL WHERE tenant_id = $1`,
        [ACME]
      );
    } finally {
      await client.end();
    }
    process.env.BOT_NAME = 'Meeting Assistant';
    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111224',
      title: 'Rejected join name',
    });
    expect(created.status).toBe(400);
    expect(created.body.error.code).toBe('BOT_NAME_NOT_DISCLOSING');
    expect(vi.mocked(recallService.createBot)).not.toHaveBeenCalled();
  });

  it('item 3: PUT storeAudio true is rejected and the column stays false', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const res = await owner.put('/api/v1/consent/settings').send({
      storeAudio: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('STORE_AUDIO_NOT_EDITABLE');

    const got = await owner.get('/api/v1/consent/settings');
    expect(got.status).toBe(200);
    expect(got.body.storeAudio).toBe(false);
    expect(got.body.consentPolicy).toBe('all_party_notice');
  });

  it('item 4: consent_policy defaults to all_party_notice and is not editable', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const got = await owner.get('/api/v1/consent/settings');
    expect(got.body.consentPolicy).toBe('all_party_notice');

    const res = await owner.put('/api/v1/consent/settings').send({
      consentPolicy: 'opt_in',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONSENT_POLICY_NOT_EDITABLE');

    const after = await owner.get('/api/v1/consent/settings');
    expect(after.body.consentPolicy).toBe('all_party_notice');
  });

  it('item 5: entering in_call_recording posts the consent chat message', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Notetaker',
    });
    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111225',
      title: 'Announcement meeting',
    });
    expect(created.status).toBe(201);
    const meetingId = created.body.meeting.id as string;
    const botId = created.body.meeting.recall_bot_id as string;

    const payload = {
      event: 'bot.status_change',
      data: {
        bot: {
          id: botId,
          status_changes: [{ code: 'in_call_recording', created_at: new Date().toISOString() }],
          metadata: {
            internal_meeting_id: meetingId,
            tenant_id: ACME,
          },
        },
      },
    };
    const body = JSON.stringify(payload);
    const eventId = `evt-announce-${crypto.randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSignature(body, timestamp, eventId, WEBHOOK_SECRET);

    const hook = await request(origin())
      .post('/webhooks/recall')
      .set({
        'content-type': 'application/json',
        'svix-id': eventId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      })
      .send(body);

    expect(hook.status).toBe(200);
    expect(vi.mocked(recallService.sendChatMessage)).toHaveBeenCalledTimes(1);
    const [, message] = vi.mocked(recallService.sendChatMessage).mock.calls[0];
    expect(message).toContain('Acme Notetaker is recording and transcribing for Acme Notes');
  });

  it('item 5: a failed chat post does not fail the in_call_recording webhook', async () => {
    vi.mocked(recallService.sendChatMessage).mockRejectedValueOnce(new Error('RECALL_API_KEY not configured'));
    const owner = await login('owner@example.com', 'Avery Owner');
    await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Notetaker',
    });
    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111227',
      title: 'Announcement failure meeting',
    });
    expect(created.status).toBe(201);
    const meetingId = created.body.meeting.id as string;
    const botId = created.body.meeting.recall_bot_id as string;

    const payload = {
      event: 'bot.status_change',
      data: {
        bot: {
          id: botId,
          status_changes: [{ code: 'in_call_recording', created_at: new Date().toISOString() }],
          metadata: {
            internal_meeting_id: meetingId,
            tenant_id: ACME,
          },
        },
      },
    };
    const body = JSON.stringify(payload);
    const eventId = `evt-announce-fail-${crypto.randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createSignature(body, timestamp, eventId, WEBHOOK_SECRET);

    const hook = await request(origin())
      .post('/webhooks/recall')
      .set({
        'content-type': 'application/json',
        'svix-id': eventId,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      })
      .send(body);

    expect(hook.status).toBe(200);
    expect(hook.body.received).toBe(true);
  });

  it('item 6: POST /meetings queues the pre-join notice to attendees when notify_attendees is on', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Notetaker',
      notifyAttendees: true,
    });
    const created = await owner.post('/api/v1/meetings').send({
      meeting_url: 'https://zoom.us/j/555111226',
      title: 'Notice meeting',
      attendeeEmails: ['attendee@example.com'],
    });
    expect(created.status).toBe(201);
    expect(created.body.noticeQueued).toBe(true);
    expect(created.body.noticeRecipients).toContain('attendee@example.com');
    expect(created.body.preJoinNotice).toMatch(/AI notetaker will record and transcribe this meeting|recorded and transcribed/i);
    expect(created.body.preJoinNotice).toContain('http://127.0.0.1:5173/privacy');
    expect(inbox.some((m) => m.to === 'attendee@example.com')).toBe(true);
    expect(inbox[0].text).toMatch(/record/i);
  });

  it('item 7: owner can save consent settings', async () => {
    const owner = await login('owner@example.com', 'Avery Owner');
    const res = await owner.put('/api/v1/consent/settings').send({
      botDisplayName: 'Owner Notetaker',
    });
    expect(res.status).toBe(200);
  });

  it('item 7: admin can save consent settings', async () => {
    const admin = await login('admin@example.com', 'Riley Admin');
    const res = await admin.put('/api/v1/consent/settings').send({
      botDisplayName: 'Admin Recorder',
    });
    expect(res.status).toBe(200);
  });

  it('item 7: member gets 403 on PUT /api/v1/consent/settings', async () => {
    const member = await login('member@example.com', 'Morgan Member');
    const res = await member.put('/api/v1/consent/settings').send({
      botDisplayName: 'Member Notetaker',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const got = await member.get('/api/v1/consent/settings');
    expect(got.status).toBe(200);
  });

  it('item 8: consent settings are isolated across tenants', async () => {
    const acme = await login('owner@example.com', 'Avery Owner');
    const saved = await acme.put('/api/v1/consent/settings').send({
      botDisplayName: 'Acme Isolation Notetaker',
    });
    expect(saved.status).toBe(200);

    const other = await login('dev@example.com', 'Dev User');
    const got = await other.get('/api/v1/consent/settings');
    expect(got.status).toBe(200);
    expect(got.body.botDisplayName).not.toBe('Acme Isolation Notetaker');

    const otherSave = await other.put('/api/v1/consent/settings').send({
      botDisplayName: 'Other Tenant Notetaker',
    });
    expect(otherSave.status).toBe(200);

    const acmeAgain = await login('owner@example.com', 'Avery Owner');
    const acmeGot = await acmeAgain.get('/api/v1/consent/settings');
    expect(acmeGot.body.botDisplayName).toBe('Acme Isolation Notetaker');
  });
});
