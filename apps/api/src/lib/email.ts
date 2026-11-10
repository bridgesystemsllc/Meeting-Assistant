/**
 * Email adapter: log transport (default) and SMTP interface. No vendor provider.
 * Do not log message bodies — invite links carry single-use tokens.
 */

import nodemailer from 'nodemailer';
import type { EmailAdapter, EmailMessage, SmtpConfig } from '@meeting-assistant/shared';
import { logger } from './logger.js';

export function createLogEmailAdapter(): EmailAdapter {
  return {
    transport: 'log',
    async send(message: EmailMessage): Promise<void> {
      logger.info({ to: message.to, subject: message.subject, transport: 'log' }, 'email dispatched');
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
  return createLogEmailAdapter();
}

let currentAdapter: EmailAdapter = createEmailAdapter();

export function getEmailAdapter(): EmailAdapter {
  return currentAdapter;
}

export function setEmailAdapter(adapter: EmailAdapter): void {
  currentAdapter = adapter;
}

/**
 * Invite email send is owned by P2-3 (seats). This hook is the accept path only.
 * Call sites in P2-3 should use getEmailAdapter().send(...) and never log the raw token.
 */
export async function sendInviteEmail(params: {
  to: string;
  tenantName: string;
  acceptUrl: string;
}): Promise<void> {
  await getEmailAdapter().send({
    to: params.to,
    subject: `You're invited to ${params.tenantName}`,
    text: `You were invited to ${params.tenantName}. Open this single-use link, then sign in: ${params.acceptUrl}`,
  });
}
