import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { accessLogLine } from './access-log.js';

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
});
