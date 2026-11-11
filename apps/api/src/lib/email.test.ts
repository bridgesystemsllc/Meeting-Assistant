import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import type { EmailMessage } from '@meeting-assistant/shared';
import {
  allowLogEmailTransport,
  createCapturingEmailAdapter,
  createEmailAdapter,
  createLogEmailAdapter,
  createSmtpEmailAdapter,
  sendInviteEmail,
  setEmailAdapter,
  smtpLogFields,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SEND_DEADLINE_MS,
  SMTP_SOCKET_TIMEOUT_MS,
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

  it('keeps nodemailer timeouts at 5s/5s/10s and a 15s send deadline', async () => {
    expect(SMTP_CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(SMTP_GREETING_TIMEOUT_MS).toBe(5_000);
    expect(SMTP_SOCKET_TIMEOUT_MS).toBe(10_000);
    expect(SMTP_SEND_DEADLINE_MS).toBe(15_000);
    const close = vi.fn();
    const sendMail = vi.fn().mockResolvedValue({});
    const spy = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail, close } as never);
    const adapter = createSmtpEmailAdapter({
      host: '127.0.0.1',
      port: 25,
      from: 'noreply@example.com',
    });
    await adapter.send({ to: 'jordan@example.com', subject: 'invite', text: 'hello' });
    expect(spy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
      })
    );
    expect(close).toHaveBeenCalled();
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

  it('aborts a slow-drip SMTP at 15s and destroys the transport', async () => {
    const sockets: net.Socket[] = [];
    const closed = new Set<net.Socket>();
    const dripTimers: ReturnType<typeof setTimeout>[] = [];
    const drip = net.createServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => undefined);
      socket.on('close', () => closed.add(socket));
      socket.write('220 slow.example.com ESMTP\r\n');
      const tick = () => {
        if (socket.destroyed) return;
        socket.write('x');
        dripTimers.push(setTimeout(tick, 1_500));
      };
      socket.once('data', tick);
    });
    await new Promise<void>((resolve) => drip.listen(0, '127.0.0.1', () => resolve()));
    const port = (drip.address() as AddressInfo).port;
    const adapter = createSmtpEmailAdapter({
      host: '127.0.0.1',
      port,
      from: 'noreply@example.com',
      secure: false,
    });
    const started = Date.now();
    try {
      await expect(
        adapter.send({ to: 'slow@example.com', subject: 'invite', text: 'hello' })
      ).rejects.toMatchObject({ code: 'ESENDDEADLINE' });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(14_000);
      expect(elapsed).toBeLessThan(18_000);
      const deadline = Date.now() + 1_000;
      while (closed.size === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(closed.size > 0 || sockets.some((socket) => socket.destroyed)).toBe(true);
    } finally {
      for (const timer of dripTimers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => drip.close((err) => (err ? reject(err) : resolve())));
    }
  }, 25_000);

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

  it('logs SMTP err.code or cause server-side and never puts them on the thrown error', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    setEmailAdapter({
      transport: 'smtp',
      async send() {
        throw Object.assign(new Error('Greeting never received'), {
          code: 'ETIMEDOUT',
          cause: { code: 'ECONNRESET' },
        });
      },
    });
    await expect(
      sendInviteEmail({
        to: 'jordan@example.com',
        tenantName: 'Acme Notes',
        acceptUrl: 'http://localhost:5173/invite/abc?tenant=acme-notes',
      })
    ).rejects.toThrow('Invite email could not be sent');
    expect(smtpLogFields({ code: 'ETIMEDOUT', cause: { code: 'ECONNRESET' } })).toEqual({
      smtpCode: 'ETIMEDOUT',
      smtpCause: 'ECONNRESET',
    });
    expect(spy.mock.calls[0]?.[0]).toEqual({ smtpCode: 'ETIMEDOUT', smtpCause: 'ECONNRESET' });
    expect(JSON.stringify(spy.mock.calls[0])).not.toContain('acceptUrl');
  });
});
