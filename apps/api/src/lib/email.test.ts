import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '@meeting-assistant/shared';
import {
  createCapturingEmailAdapter,
  createEmailAdapter,
  createLogEmailAdapter,
  sendInviteEmail,
  setEmailAdapter,
} from './email.js';
import { logger } from './logger.js';

describe('email adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMTP_HOST;
    setEmailAdapter(createLogEmailAdapter());
  });

  it('defaults to the log transport when SMTP_HOST is unset', () => {
    delete process.env.SMTP_HOST;
    expect(createEmailAdapter().transport).toBe('log');
  });

  it('log transport logs the invite link and no token_hash', async () => {
    const spy = vi.spyOn(logger, 'info');
    const acceptUrl = 'http://localhost:5173/invite/raw-token-value?tenant=acme-notes';
    await createLogEmailAdapter().send({
      to: 'jordan@example.com',
      subject: "You're invited to Acme Notes",
      text: `Open this single-use link, then sign in: ${acceptUrl}`,
      acceptUrl,
    });
    expect(spy).toHaveBeenCalled();
    const payload = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.acceptUrl).toBe(acceptUrl);
    expect(payload.to).toBe('jordan@example.com');
    expect(JSON.stringify(payload)).not.toContain('token_hash');
  });

  it('capturing adapter stores the dispatched invite email', async () => {
    const inbox: EmailMessage[] = [];
    const adapter = createCapturingEmailAdapter(inbox);
    setEmailAdapter(adapter);
    await sendInviteEmail({
      to: 'jordan@example.com',
      tenantName: 'Acme Notes',
      acceptUrl: 'http://localhost:5173/invite/abc?tenant=acme-notes',
    });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toBe('jordan@example.com');
    expect(inbox[0].acceptUrl).toContain('/invite/');
    expect(inbox[0].text).toContain('Acme Notes');
  });
});
