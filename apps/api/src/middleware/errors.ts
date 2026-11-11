/**
 * Global error handler middleware
 */

import type { ErrorRequestHandler } from 'express';
import { redactAccessLogUrl } from '../lib/access-log.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/http-error.js';

function httpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const rec = err as { status?: unknown; statusCode?: unknown };
  const status = rec.status ?? rec.statusCode;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600) {
    return status;
  }
  return undefined;
}

function genericClientError(status: number): { code: string; message: string } {
  if (status === 413) {
    return { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' };
  }
  if (status === 415) {
    return { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' };
  }
  return { code: 'BAD_REQUEST', message: 'Invalid request' };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const errCode =
    typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : undefined;
  const cause = typeof err === 'object' && err && 'cause' in err ? (err as { cause?: unknown }).cause : undefined;
  const errCause =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;

  logger.error(
    {
      err,
      errCode,
      errCause,
      path: redactAccessLogUrl(req.path || req.originalUrl || ''),
      method: req.method,
    },
    'Unhandled error'
  );

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  const pgCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  if (pgCode === '22P02') {
    res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid id' } });
    return;
  }

  const status = httpStatus(err);
  if (status !== undefined && status < 500) {
    res.status(status).json({ error: genericClientError(status) });
    return;
  }

  // Never put SMTP/transport codes or raw error text in HTTP 500 bodies.
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
};
