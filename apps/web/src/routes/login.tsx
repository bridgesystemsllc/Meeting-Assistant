import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { loginUrl } from '../lib/auth';

const ERROR_COPY: Record<string, string> = {
  no_access: 'No access: ask your admin.',
  seat_inactive: 'This seat is inactive. Ask your admin.',
  invalid_state: 'Sign-in expired. Try again.',
  invalid_invite: 'That invite link is invalid or has already been used.',
  invite_email: 'That invite was issued to a different email.',
  unverified: 'That email is not verified with the identity provider.',
  oidc: 'Sign-in failed. Try again.',
};

export function LoginPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const errorKey = params.get('error');
  const invite = params.get('invite');
  const error = errorKey ? ERROR_COPY[errorKey] || ERROR_COPY.oidc : null;

  const googleHref = useMemo(() => loginUrl('google', invite), [invite]);
  const microsoftHref = useMemo(() => loginUrl('microsoft', invite), [invite]);

  if (status === 'authenticated') {
    return <Navigate to="/meetings" replace />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <section className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h1 className="text-lg font-semibold text-[var(--color-fg)]">[PRODUCT NAME]</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Sign in to continue. Accounts are invite-only.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-[var(--color-danger)]/30 bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <a
            href={googleHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg)]"
          >
            Continue with Google
          </a>
          <a
            href={microsoftHref}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-fg)] text-sm font-medium text-[var(--color-surface)] hover:opacity-90"
          >
            Continue with Microsoft
          </a>
        </div>
      </section>
    </main>
  );
}
