import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { loginUrl } from '../lib/auth';

type InviteState =
  | { status: 'loading' }
  | { status: 'ready'; tenantName: string; email: string }
  | { status: 'error'; message: string };

const ERROR_COPY: Record<string, string> = {
  INVALID_INVITE: 'That invite link is invalid.',
  INVITE_USED: 'That invite link has already been used.',
  INVITE_EXPIRED: 'That invite link has expired.',
  INVITE_REVOKED: 'That invite was revoked.',
  INVITE_WRONG_TENANT: 'That invite belongs to a different workspace.',
};

export function InvitePage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const tenantSlug = params.get('tenant');
  const [state, setState] = useState<InviteState>({ status: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: ERROR_COPY.INVALID_INVITE });
      return;
    }
    const url = new URL(`/api/v1/auth/invites/${token}`, window.location.origin);
    if (tenantSlug) url.searchParams.set('tenant', tenantSlug);
    void fetch(url.pathname + url.search, { credentials: 'include' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = body?.error?.code as string | undefined;
          setState({
            status: 'error',
            message: ERROR_COPY[code ?? 'INVALID_INVITE'] ?? ERROR_COPY.INVALID_INVITE,
          });
          return;
        }
        setState({
          status: 'ready',
          tenantName: body.tenant.name as string,
          email: body.email as string,
        });
      })
      .catch(() => {
        setState({ status: 'error', message: ERROR_COPY.INVALID_INVITE });
      });
  }, [token, tenantSlug]);

  const googleHref = useMemo(() => loginUrl('google', token), [token]);
  const microsoftHref = useMemo(() => loginUrl('microsoft', token), [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <section className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h1 className="text-lg font-semibold text-[var(--color-fg)]">Accept invite</h1>
        {state.status === 'loading' && (
          <p className="mt-2 text-sm text-[var(--color-muted)]">Checking invite…</p>
        )}
        {state.status === 'error' && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
            {state.message}
          </p>
        )}
        {state.status === 'ready' && (
          <>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Sign in as {state.email} to join {state.tenantName}.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href={googleHref}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Continue with Google
              </a>
              <a
                href={microsoftHref}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-fg)] text-sm font-medium text-[var(--color-surface)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Continue with Microsoft
              </a>
            </div>
          </>
        )}
        <p className="mt-6 text-sm">
          <Link to="/login" className="text-[var(--color-muted)] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
