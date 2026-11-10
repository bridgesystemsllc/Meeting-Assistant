/**
 * Email adapter interface.
 * v1: log/dev transport + SMTP. No vendor provider (ATLAS Q8).
 * Invite send lives in P2-3; P2-1 ships the adapter and accept-invite hook.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Present on invite mail. Never logged; capturing transports may keep it in-memory for tests. */
  acceptUrl?: string;
}

export interface EmailAdapter {
  readonly transport: 'log' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure?: boolean;
}
