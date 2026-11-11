/**
 * Email adapter: log transport (dev/test) and SMTP from env. No vendor provider.
 * Log transport never logs acceptUrl, tokens, or message bodies.
 * Outside development/test the log transport is refused unless SMTP_HOST is set.
 */

import net from 'node:net';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailAdapter, EmailMessage, SmtpConfig } from '@meeting-assistant/shared';
import { logger } from './logger.js';

/** Fail fast so invite SMTP I/O cannot hold the tenant lock for tens of seconds. */
export const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
export const SMTP_GREETING_TIMEOUT_MS = 5_000;
export const SMTP_SOCKET_TIMEOUT_MS = 10_000;
/** Hard cap so a slow-drip SMTP cannot hold the tenant/seat lock past this bound. */
export const SMTP_SEND_DEADLINE_MS = 15_000;

export function allowLogEmailTransport(env = process.env.NODE_ENV): boolean {
  return env === 'development' || env === 'test';
}

export function createLogEmailAdapter(): EmailAdapter {
  return {
    transport: 'log',
    async send(message: EmailMessage): Promise<void> {
      logger.info(
        {
          to: message.to,
          subject: message.subject,
          transport: 'log',
        },
        'email dispatched'
      );
    },
  };
}

export function createCapturingEmailAdapter(sent: EmailMessage[] = []): EmailAdapter & {
  sent: EmailMessage[];
} {
  return {
    transport: 'log',
    sent,
    async send(message: EmailMessage): Promise<void> {
      sent.push({ ...message });
      await createLogEmailAdapter().send(message);
    },
  };
}

function smtpTransportOptions(config: SmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  };
}

type SmtpSocketOwner = {
  transporter: Transporter;
  destroy: () => void;
};

function createTrackedSmtpTransport(config: SmtpConfig): SmtpSocketOwner {
  const sockets = new Set<net.Socket>();
  const transporter = nodemailer.createTransport({
    ...smtpTransportOptions(config),
    getSocket(_opts: unknown, callback: (err: Error | null, socketOpts?: { connection: net.Socket } | false) => void) {
      const socket = net.connect({ host: config.host, port: config.port });
      sockets.add(socket);
      const onError = (err: Error) => {
        sockets.delete(socket);
        callback(err);
      };
      socket.once('error', onError);
      socket.once('connect', () => {
        socket.off('error', onError);
        callback(null, { connection: socket });
      });
      socket.once('close', () => sockets.delete(socket));
    },
  });

  return {
    transporter,
    destroy() {
      for (const socket of sockets) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
      sockets.clear();
      try {
        transporter.close();
      } catch {
        // ignore
      }
    },
  };
}

/** SMTP err.code / cause for server-side logs only — never HTTP bodies. */
export function smtpLogFields(err: unknown): { smtpCode?: string; smtpCause?: string } {
  if (!err || typeof err !== 'object') return {};
  const rec = err as { code?: unknown; cause?: unknown };
  const fields: { smtpCode?: string; smtpCause?: string } = {};
  if (rec.code != null && rec.code !== '') {
    fields.smtpCode = String(rec.code);
  }
  if (rec.cause != null) {
    if (typeof rec.cause === 'object' && rec.cause && 'code' in rec.cause) {
      const causeCode = (rec.cause as { code?: unknown }).code;
      if (causeCode != null && causeCode !== '') {
        fields.smtpCause = String(causeCode);
      }
    } else if (typeof rec.cause === 'string' && rec.cause !== '') {
      fields.smtpCause = rec.cause;
    }
  }
  return fields;
}

export function createSmtpEmailAdapter(config: SmtpConfig): EmailAdapter {
  return {
    transport: 'smtp',
    async send(message: EmailMessage): Promise<void> {
      const tracked = createTrackedSmtpTransport(config);
      let timedOut = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          timedOut = true;
          tracked.destroy();
          reject(Object.assign(new Error('SMTP send deadline exceeded'), { code: 'ESENDDEADLINE' }));
        }, SMTP_SEND_DEADLINE_MS);
      });
      const sendPromise = tracked.transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      void sendPromise.catch(() => undefined);
      try {
        await Promise.race([sendPromise, deadline]);
        logger.info({ to: message.to, subject: message.subject, transport: 'smtp' }, 'email dispatched');
      } catch (err) {
        tracked.destroy();
        if (timedOut) {
          throw Object.assign(new Error('SMTP send deadline exceeded'), { code: 'ESENDDEADLINE' });
        }
        throw err;
      } finally {
        if (deadlineTimer) clearTimeout(deadlineTimer);
        tracked.destroy();
      }
    },
  };
}

export function createEmailAdapter(): EmailAdapter {
  const host = process.env.SMTP_HOST;
  if (host) {
    return createSmtpEmailAdapter({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.FROM_EMAIL || 'noreply@example.com',
    });
  }
  if (allowLogEmailTransport()) {
    return createLogEmailAdapter();
  }
  throw new Error('SMTP_HOST is required outside development; log email transport is disabled');
}

let currentAdapter: EmailAdapter | undefined;

function defaultAdapter(): EmailAdapter {
  if (!currentAdapter) {
    currentAdapter = createEmailAdapter();
  }
  return currentAdapter;
}

export function getEmailAdapter(): EmailAdapter {
  return defaultAdapter();
}

export function setEmailAdapter(adapter: EmailAdapter): void {
  currentAdapter = adapter;
}

export async function sendInviteEmail(params: {
  to: string;
  tenantName: string;
  acceptUrl: string;
}): Promise<void> {
  try {
    await getEmailAdapter().send({
      to: params.to,
      subject: `You're invited to ${params.tenantName}`,
      text: `You were invited to ${params.tenantName}. Open this single-use link, then sign in: ${params.acceptUrl}`,
      acceptUrl: params.acceptUrl,
    });
  } catch (err) {
    logger.error(smtpLogFields(err), 'invite email could not be sent');
    throw new Error('Invite email could not be sent');
  }
}
