/**
 * Global error handler middleware
 */

import type { ErrorRequestHandler } from 'express';
import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/http-error.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
    },
    'Unhandled error'
  );

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
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
