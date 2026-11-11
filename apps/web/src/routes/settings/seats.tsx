import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { hasRequiredRole, type Role, type SeatsResponse } from '@meeting-assistant/shared';
import { useAuth } from '../../hooks/useAuth';
import { SeatsFooter } from '../../components/SeatsFooter';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

function errorMessage(code: string, seatLimit: number): string {
  if (code === 'SEAT_LIMIT_REACHED') {
    return `All ${seatLimit} seats are in use. Ask your admin.`;
  }
  if (code === 'ALREADY_MEMBER') return 'This person already has a seat.';
  if (code === 'LAST_OWNER') return 'The last active owner cannot be deactivated.';
  if (code === 'FORBIDDEN') return 'You do not have permission to manage seats.';
  return 'Something went wrong. Try again.';
}

function formatLastActive(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function SeatsPage() {
  const { me, refresh } = useAuth();
  const isAdmin = me ? hasRequiredRole(me.role, 'admin') : false;
  const [data, setData] = useState<SeatsResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingState('loading');
    try {
      const res = await fetch('/api/v1/tenant/seats', { credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(errorMessage(body?.error?.code ?? '', me?.seats?.seat_limit ?? 1));
      }
      setData(body as SeatsResponse);
      setError(null);
      setLoadingState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoadingState('error');
    }
  }, [me?.seats?.seat_limit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(path: string, init?: RequestInit): Promise<boolean> {
    setPending(path);
    setError(null);
    try {
      const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        ...init,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(body?.error?.code ?? '', data?.seat_limit ?? me?.seats?.seat_limit ?? 1));
        return false;
      }
      setData(body as SeatsResponse);
      await refresh();
      return true;
    } finally {
      setPending(null);
    }
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate('/api/v1/tenant/seats/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    if (ok) {
      setEmail('');
      setRole('member');
    }
  }

  const seatLimit = data?.seat_limit ?? me?.seats?.seat_limit ?? 1;
  const seatsUsed = data?.seats_used ?? me?.seats?.seats_used ?? 0;
  const atLimit = seatsUsed >= seatLimit;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Seats</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Invite people to this workspace. Each pending invite and active member uses a seat.
      </p>

      {isAdmin && (
        <form onSubmit={(event) => void onInvite(event)} className="card mt-6 max-w-xl p-4">
          <h2 className="text-sm font-semibold">Invite a member</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
            <div>
              <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                Email
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fg)]"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                Role
              </label>
              <select
                id="invite-role"
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-fg)]"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {me?.role === 'owner' && <option value="owner">Owner</option>}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="btn-primary w-full sm:w-auto"
                disabled={Boolean(pending) || atLimit}
              >
                Invite
              </button>
            </div>
          </div>
          {atLimit && (
            <p className="mt-3 text-sm text-[var(--color-danger)]" role="status">
              All {seatLimit} seats are in use. Ask your admin.
            </p>
          )}
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {loadingState === 'loading' && (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Loading seats…</p>
      )}

      {loadingState === 'success' && data && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Members and pending invites</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                <th scope="col" className="py-2 pr-3 font-medium">Email</th>
                <th scope="col" className="py-2 pr-3 font-medium">Role</th>
                <th scope="col" className="py-2 pr-3 font-medium">Seat status</th>
                <th scope="col" className="py-2 pr-3 font-medium">Last active</th>
                {isAdmin && (
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3 font-medium">{member.name || '—'}</td>
                  <td className="py-2 pr-3">{member.email}</td>
                  <td className="py-2 pr-3 capitalize">{member.role}</td>
                  <td className="py-2 pr-3 capitalize">{member.seat_status}</td>
                  <td className="py-2 pr-3 text-[var(--color-muted)]">{formatLastActive(member.last_active)}</td>
                  {isAdmin && (
                    <td className="py-2">
                      {member.seat_status === 'deactivated' ? (
                        <button
                          type="button"
                          className="btn-secondary h-8 text-xs"
                          disabled={Boolean(pending)}
                          onClick={() => void mutate(`/api/v1/tenant/seats/${member.id}/reactivate`, { method: 'POST' })}
                        >
                          Reactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary h-8 text-xs"
                          disabled={Boolean(pending)}
                          onClick={() => void mutate(`/api/v1/tenant/seats/${member.id}/deactivate`, { method: 'POST' })}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {data.invites.map((invite) => (
                <tr key={invite.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3 text-[var(--color-muted)]">—</td>
                  <td className="py-2 pr-3">{invite.email}</td>
                  <td className="py-2 pr-3 capitalize">{invite.role}</td>
                  <td className="py-2 pr-3">Pending invite</td>
                  <td className="py-2 pr-3 text-[var(--color-muted)]">—</td>
                  {isAdmin && (
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary h-8 text-xs"
                          disabled={Boolean(pending)}
                          onClick={() =>
                            void mutate(`/api/v1/tenant/seats/invites/${invite.id}/resend`, { method: 'POST' })
                          }
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          className="btn-secondary h-8 text-xs"
                          disabled={Boolean(pending)}
                          onClick={() =>
                            void mutate(`/api/v1/tenant/seats/invites/${invite.id}/revoke`, { method: 'POST' })
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {data.members.length === 0 && data.invites.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-[var(--color-muted)]">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <SeatsFooter seatsUsed={seatsUsed} seatLimit={seatLimit} />
    </div>
  );
}
