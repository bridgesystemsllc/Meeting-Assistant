import type { MeResponse } from '@meeting-assistant/shared';

declare global {
  namespace Express {
    interface Request {
      cookies: Record<string, string | undefined>;
      auth?: MeResponse & { sessionId: string; seat_status: MeResponse['seat_status'] };
    }
  }
}

export {};
