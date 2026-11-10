import type { Response } from 'express';
import type { AuthErrorCode } from '@meeting-assistant/shared';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): Response {
  return res.status(statusCode).json({ error: { code, message } });
}

export function unauthenticated(res: Response, message = 'Authentication required'): Response {
  return sendError(res, 401, 'UNAUTHENTICATED' satisfies AuthErrorCode, message);
}

export function forbidden(res: Response, message = 'Insufficient role'): Response {
  return sendError(res, 403, 'FORBIDDEN' satisfies AuthErrorCode, message);
}

export function seatInactive(
  res: Response,
  message = 'Your seat is inactive. Ask your admin.'
): Response {
  return sendError(res, 403, 'SEAT_INACTIVE' satisfies AuthErrorCode, message);
}

export function notFound(res: Response, message = 'Not found'): Response {
  return sendError(res, 404, 'NOT_FOUND', message);
}

export function badRequest(res: Response, code: string, message: string): Response {
  return sendError(res, 400, code, message);
}
