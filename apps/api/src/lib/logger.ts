/**
 * Structured JSON logger using Pino
 * Avoids logging sensitive data (transcripts, URLs, webhook bodies)
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.secret',
      '*.apiKey',
      '*.transcript',
      '*.recordingUrl',
    ],
    remove: true,
  },
});

export type Logger = typeof logger;
