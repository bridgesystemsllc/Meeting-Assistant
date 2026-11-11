import type { MeResponse } from '@meeting-assistant/shared';

export type { MeResponse };

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch('/api/v1/me', { credentials: 'include' });
  if (res.status === 401) {
    throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!res.ok) {
    throw new AuthError(res.status, 'OIDC_FAILED', 'Unable to load session');
  }
  return (await res.json()) as MeResponse;
}

export async function logout(): Promise<void> {
  await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
}

export function loginUrl(provider: 'google' | 'microsoft', invite?: string | null): string {
  const url = new URL(`/api/v1/auth/login/${provider}`, window.location.origin);
  if (invite) url.searchParams.set('invite', invite);
  return url.pathname + url.search;
}
