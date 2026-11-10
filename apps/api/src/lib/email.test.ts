import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmailMessage } from '@meeting-assistant/shared';
import {
  allowLogEmailTransport,
  createCapturingEmailAdapter,
  createEmailAdapter,
  createLogEmailAdapter,
  createSmtpEmailAdapter,
  sendInviteEmail,
  setEmailAdapter,
} from './email.js';
import { logger } from './logger.js';

describe('email adapter', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMTP_HOST;
    process.env.NODE_ENV = previousNodeEnv;
    setEmailAdapter(createLogEmailAdapter());
  });

  it('defaults to the log transport in development and test', () => {
    delete process.env.SMTP_HOST;
    process.env.NODE_ENV = 'test';
    expect(createEmailAdapter().transport).toBe('log');
    expect(allowLogEmailTransport('development')).toBe(true);
  });

  it('refuses the log transport outside development unless SMTP is configured', () => {
    delete process.env.SMTP_HOST;
    process.env.NODE_ENV = 'production';
    expect(() => createEmailAdapter()).toThrow(/SMTP_HOST is required/);
    process.env.SMTP_HOST = 'smtp.example.com';
    expect(createEmailAdapter().transport).toBe('smtp');
  });

  it('allows the log transport in development without SMTP_HOST', () => {
    delete process.env.SMTP_HOST;
    process.env.NODE_ENV = 'development';
    expect(createEmailAdapter().transport).toBe('log');
  });

  it('log transport does not log acceptUrl or the raw token', async () => {
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
    expect(payload.to).toBe('jordan@example.com');
    expect(payload.acceptUrl).toBeUndefined();
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain('raw-token-value');
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain(acceptUrl);
    expect(JSON.stringify(payload)).not.toContain('token_hash');
  });

  it('fails fast when the SMTP server accepts the TCP connection but never greets', async () => {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', () => resolve()));
    const port = (silent.address() as AddressInfo).port;
    const adapter = createSmtpEmailAdapter({
      host: '127.0.0.1',
      port,
      from: 'noreply@example.com',
      secure: false,
    });
    const started = Date.now();
    try {
      await expect(
        adapter.send({ to: 'silent@example.com', subject: 'invite', text: 'hello' })
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(8_000);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => silent.close((err) => (err ? reject(err) : resolve())));
    }
  }, 15_000);

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
