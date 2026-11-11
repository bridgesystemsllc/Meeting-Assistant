/**
 * Structured JSON logger using Pino
 * Avoids logging sensitive data (transcripts, URLs, webhook bodies, tokens)
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.referer',
  'req.headers.referrer',
  'referer',
  'referrer',
  'res.headers["set-cookie"]',
  'cookie',
  'set-cookie',
  'token',
  'token_hash',
  'code_verifier',
  'id_token',
  'access_token',
  'refresh_token',
  'clientSecret',
  'client_secret',
  'password',
  '*.password',
  '*.secret',
  '*.apiKey',
  '*.transcript',
  '*.recordingUrl',
  '*.token',
  '*.token_hash',
  '*.code_verifier',
  '*.id_token',
  '*.access_token',
  '*.refresh_token',
  '*.clientSecret',
  '*.client_secret',
  'acceptUrl',
  'accept_url',
  '*.acceptUrl',
  '*.accept_url',
  'inviteToken',
  'invite_token',
  '*.inviteToken',
  '*.invite_token',
];

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
    paths: LOG_REDACT_PATHS,
    remove: true,
  },
});

export type Logger = typeof logger;
