/**
 * Global error handler middleware
 */

import type { ErrorRequestHandler } from 'express';
import { redactAccessLogUrl } from '../lib/access-log.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/http-error.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error(
    {
      err,
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

  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: { code: err.code || 'INTERNAL', message },
  });
};
