import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from './errors.js';
import { HttpError } from '../lib/http-error.js';

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json, res: { status } as unknown as Response };
}

describe('errorHandler', () => {
  it('does not put SMTP error details or transport codes in HTTP 500 bodies', () => {
    const err = Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' });
    const { status, json, res } = mockRes();
    errorHandler(err, { path: '/api/v1/tenant/seats/invite', method: 'POST' } as Request, res, (() => undefined) as NextFunction);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/ETIMEDOUT|Greeting|ECONNECTION|ESOCKET/i);
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
});
