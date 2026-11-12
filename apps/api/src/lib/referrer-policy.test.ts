import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Referrer-Policy', () => {
  it('sends no-referrer on auth routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/auth/login/google');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});
