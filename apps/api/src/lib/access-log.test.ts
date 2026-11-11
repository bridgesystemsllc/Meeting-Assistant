import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { accessLogLine, redactAccessLogUrl } from './access-log.js';

describe('access log', () => {
  it('strips query strings so invite tokens and OIDC codes are not logged', () => {
    const tokens = {
      url: () => '/api/v1/auth/login/google?invite=plaintext-token',
      'remote-addr': () => '127.0.0.1',
      'remote-user': () => undefined,
      date: () => '10/Nov/2026:00:00:00 +0000',
      method: () => 'GET',
      'http-version': () => '1.1',
      status: () => '302',
      res: () => '0',
      referrer: () => 'https://mail.example.com/invite?token=plaintext-token',
      'user-agent': () => 'test',
    };
    const line = accessLogLine(tokens, {} as Request, {} as Response);
    expect(line).toContain('/api/v1/auth/login/google');
    expect(line).not.toContain('invite=');
    expect(line).not.toContain('plaintext-token');
    expect(line).not.toContain('Referer');
    expect(line).not.toContain('mail.example.com');
  });

  it('redacts the live invite token in GET /api/v1/auth/invites/<token>', () => {
    const rawToken = 'test-invite-token-value';
    const tokens = {
      url: () => `/api/v1/auth/invites/${rawToken}`,
      'remote-addr': () => '127.0.0.1',
      'remote-user': () => undefined,
      date: () => '10/Nov/2026:00:00:00 +0000',
      method: () => 'GET',
      'http-version': () => '1.1',
      status: () => '200',
      res: () => '186',
      'user-agent': () => 'test',
    };
    const line = accessLogLine(tokens, {} as Request, {} as Response);
    expect(line).toContain('/api/v1/auth/invites/[redacted]');
    expect(line).not.toContain(rawToken);
  });

  it('redacts invite tokens on unserved 404 path variants', () => {
    const rawToken = 'test-invite-token-value';
    const variants = [
      `/api/v1/auth/invite/${rawToken}`,
      `/api/v1/invites/${rawToken}`,
      `/invites/${rawToken}`,
    ];
    for (const url of variants) {
      const tokens = {
        url: () => url,
        'remote-addr': () => '127.0.0.1',
        'remote-user': () => undefined,
        date: () => '10/Nov/2026:00:00:00 +0000',
        method: () => 'GET',
        'http-version': () => '1.1',
        status: () => '404',
        res: () => '58',
        'user-agent': () => 'test',
      };
      const line = accessLogLine(tokens, {} as Request, {} as Response);
      expect(line).toContain('[redacted]');
      expect(line).not.toContain(rawToken);
    }
  });

  it('decodes and normalizes encoded 404/401 invite paths before redacting tokens', () => {
    const rawToken = 'test-invite-token-value';
    const encoded = encodeURIComponent(rawToken);
    const doubleEncoded = encodeURIComponent(encoded);
    const variants: Array<{ url: string; status: string }> = [
      { url: `/invite/${encoded}`, status: '404' },
      { url: `/api/v1/auth/invites/${encoded}`, status: '401' },
      { url: `/invites/${doubleEncoded}`, status: '404' },
      { url: `/%69nvite/${rawToken}`, status: '401' },
      { url: `/app/../invite/${encoded}`, status: '404' },
    ];
    for (const { url, status } of variants) {
      const tokens = {
        url: () => url,
        'remote-addr': () => '127.0.0.1',
        'remote-user': () => undefined,
        date: () => '10/Nov/2026:00:00:00 +0000',
        method: () => 'GET',
        'http-version': () => '1.1',
        status: () => status,
        res: () => '58',
        'user-agent': () => 'test',
      };
      const line = accessLogLine(tokens, {} as Request, {} as Response);
      expect(line).toContain('[redacted]');
      expect(line).not.toContain(rawToken);
      expect(line).not.toContain(encoded);
      expect(line).not.toContain(doubleEncoded);
    }
    expect(redactAccessLogUrl(`/api/v1/tenant/seats/invites/${rawToken}`)).toContain(rawToken);
  });
});
