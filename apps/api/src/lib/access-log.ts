import { posix as posixPath } from 'node:path';
import type { Request, Response } from 'express';

type MorganTokens = Record<
  string,
  ((req: Request, res: Response, arg?: string) => string | undefined) | undefined
>;

function decodePath(raw: string): string {
  let decoded = raw;
  for (let i = 0; i < 5; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

/** Combined-style access log without query strings, path tokens, or Referer. */
export function redactAccessLogUrl(raw: string): string {
  const pathOnly = raw.split('?')[0] ?? '';
  if (!pathOnly) return '';
  const decoded = decodePath(pathOnly);
  const normalized = posixPath.normalize(decoded);
  // Redact the remainder of an /invite or /invites path (not /seats/invites/:id).
  return normalized.replace(/(?<!\/seats)(\/invites?\/).+$/gi, '$1[redacted]');
}

export function accessLogLine(tokens: MorganTokens, req: Request, res: Response): string {
  const url = redactAccessLogUrl(tokens.url?.(req, res) ?? '');
  return [
    tokens['remote-addr']?.(req, res),
    '-',
    tokens['remote-user']?.(req, res) || '-',
    `[${tokens.date?.(req, res, 'clf')}]`,
    `"${tokens.method?.(req, res)} ${url} HTTP/${tokens['http-version']?.(req, res)}"`,
    tokens.status?.(req, res),
    tokens.res?.(req, res, 'content-length') || '-',
    '"-"',
    `"${tokens['user-agent']?.(req, res) || '-'}"`,
  ].join(' ');
}
