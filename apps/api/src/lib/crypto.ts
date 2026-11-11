import { createHash, randomBytes } from 'node:crypto';

/** 256-bit session / invite token, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex (64 chars) — the only form stored in Postgres. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
