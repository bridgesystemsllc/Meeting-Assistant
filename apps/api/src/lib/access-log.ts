import type { Request, Response } from 'express';

type MorganTokens = Record<
  string,
  ((req: Request, res: Response, arg?: string) => string | undefined) | undefined
>;

/** Combined-style access log without query strings or Referer (invite tokens, code, state). */
export function accessLogLine(tokens: MorganTokens, req: Request, res: Response): string {
  const url = (tokens.url?.(req, res) ?? '').split('?')[0];
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
