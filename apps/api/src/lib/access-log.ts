import type { Request, Response } from 'express';

type MorganTokens = Record<
  string,
  ((req: Request, res: Response, arg?: string) => string | undefined) | undefined
>;

/** Combined-style access log without query strings, path tokens, or Referer. */
export function redactAccessLogUrl(raw: string): string {
  const pathOnly = raw.split('?')[0];
  return pathOnly.replace(/(?<!\/seats)(\/invites?\/)[^/]+/gi, '$1[redacted]');
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
