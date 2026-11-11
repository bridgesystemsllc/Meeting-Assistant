import { describe, expect, it } from 'vitest';
import { callbackUrlFromStored } from './oidc.js';

describe('callbackUrlFromStored', () => {
  it('uses the stored redirect_uri, not the request Host', () => {
    const stored = 'http://127.0.0.1:3011/api/v1/auth/callback/google';
    const requestUrl = new URL(
      'http://evil.example/api/v1/auth/callback/google?code=abc&state=xyz'
    );
    const callback = callbackUrlFromStored(stored, requestUrl);
    expect(callback.origin).toBe('http://127.0.0.1:3011');
    expect(callback.searchParams.get('code')).toBe('abc');
    expect(callback.searchParams.get('state')).toBe('xyz');
    expect(callback.toString()).not.toContain('evil.example');
  });
});
