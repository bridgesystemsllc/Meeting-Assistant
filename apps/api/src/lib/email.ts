/**
 * Email adapter: log transport (dev/test) and SMTP from env. No vendor provider.
 * Log transport never logs acceptUrl, tokens, or message bodies.
 * Outside development/test the log transport is refused unless SMTP_HOST is set.
 */

import nodemailer from 'nodemailer';
import type { EmailAdapter, EmailMessage, SmtpConfig } from '@meeting-assistant/shared';
import { logger } from './logger.js';

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

export function createSmtpEmailAdapter(config: SmtpConfig): EmailAdapter {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  return {
    transport: 'smtp',
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info({ to: message.to, subject: message.subject, transport: 'smtp' }, 'email dispatched');
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
  await getEmailAdapter().send({
    to: params.to,
    subject: `You're invited to ${params.tenantName}`,
    text: `You were invited to ${params.tenantName}. Open this single-use link, then sign in: ${params.acceptUrl}`,
    acceptUrl: params.acceptUrl,
  });
}
