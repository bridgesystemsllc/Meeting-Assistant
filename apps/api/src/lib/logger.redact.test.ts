import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { Writable } from 'node:stream';
import { LOG_REDACT_PATHS } from './logger.js';

describe('logger redaction', () => {
  it('does not emit tokens, cookies, or secrets', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(String(chunk));
        cb();
      },
    });

    const log = pino(
      {
        redact: {
          paths: LOG_REDACT_PATHS,
          remove: true,
        },
      },
      stream
    );

    log.info({
      req: {
        headers: {
          authorization: 'Bearer super-secret',
          cookie: 'ma_session=raw-token',
          referer: 'https://mail.example.com/invite?token=plaintext-token',
        },
      },
      token: 'raw-session-token',
      token_hash: 'abc123',
      code_verifier: 'pkce-secret',
      id_token: 'eyJhbGciOiJub25lIn0.payload',
      access_token: 'access-secret',
      clientSecret: 'oauth-secret',
      password: 'hunter2',
    }, 'auth debug');

    await new Promise((r) => setImmediate(r));
    const out = chunks.join('');
    expect(out).not.toContain('super-secret');
    expect(out).not.toContain('raw-token');
    expect(out).not.toContain('raw-session-token');
    expect(out).not.toContain('pkce-secret');
    expect(out).not.toContain('access-secret');
    expect(out).not.toContain('oauth-secret');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('eyJhbGciOiJub25lIn0');
    expect(out).not.toContain('mail.example.com');
    expect(out).not.toContain('plaintext-token');
  });
});
