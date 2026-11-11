import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { errorHandler } from './errors.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { createApp } from '../app.js';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, res: { status } as unknown as Response };
}

const generic500 = { error: { code: 'INTERNAL', message: 'Internal server error' } };

describe('errorHandler', () => {
  it('does not put SMTP error details or transport codes in HTTP 500 bodies', () => {
    const err = Object.assign(new Error('Greeting never received'), {
      code: 'ETIMEDOUT',
      cause: { code: 'ECONNRESET' },
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    const { status, json, res } = mockRes();
    errorHandler(err, { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request, res, (() => undefined) as NextFunction);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(generic500);
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/ETIMEDOUT|Greeting|ECONNECTION|ESOCKET|ECONNRESET/i);
    const logged = errorSpy.mock.calls[0]?.[0] as { errCode?: string; errCause?: string };
    expect(logged.errCode).toBe('ETIMEDOUT');
    expect(logged.errCause).toBe('ECONNRESET');
    errorSpy.mockRestore();
  });

  it('still returns structured HttpError bodies', () => {
    const { status, json, res } = mockRes();
    errorHandler(
      new HttpError(409, 'ALREADY_MEMBER', 'This person already has a seat'),
      { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request,
      res,
      (() => undefined) as NextFunction
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'ALREADY_MEMBER', message: 'This person already has a seat' },
    });
  });

  it('returns 400 with a generic body for malformed JSON', () => {
    const err = Object.assign(new SyntaxError('Unexpected token o in JSON at position 1'), {
      status: 400,
      statusCode: 400,
      type: 'entity.parse.failed',
    });
    const { status, json, res } = mockRes();
    errorHandler(err, { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request, res, (() => undefined) as NextFunction);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/Unexpected token|entity\.parse/i);
  });

  it('returns 415 with a generic body for an unsupported charset', () => {
    const err = Object.assign(new Error('unsupported charset "UTF-16"'), {
      status: 415,
      statusCode: 415,
      type: 'charset.unsupported',
      charset: 'utf-16',
    });
    const { status, json, res } = mockRes();
    errorHandler(err, { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request, res, (() => undefined) as NextFunction);
    expect(status).toHaveBeenCalledWith(415);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
    });
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/UTF-16|charset/i);
  });

  it('returns 413 with a generic body for payload too large', () => {
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      type: 'entity.too.large',
      limit: 10 * 1024 * 1024,
    });
    const { status, json, res } = mockRes();
    errorHandler(err, { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request, res, (() => undefined) as NextFunction);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    });
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/entity\.too\.large|10485760/i);
  });
});

describe('body parser client errors', () => {
  const app = createApp();

  it('malformed JSON is 400 with a generic body', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected token|SyntaxError|JSON/i);
  });

  it('unsupported charset is 415 with a generic body', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{}');
    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/iso-8859-1|ISO-8859-1/i);
  });

  it('payload too large is 413 with a generic body', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(Buffer.alloc(11 * 1024 * 1024, 97));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/entity\.too\.large|10485760/i);
  }, 15_000);
});
