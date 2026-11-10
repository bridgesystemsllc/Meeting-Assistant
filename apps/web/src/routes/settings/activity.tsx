import { useCallback, useEffect, useState } from 'react';
import {
  AUDIT_ACTION_LABELS,
  type ActivityItem,
  type ActivityListResponse,
  type AuditAction,
} from '@meeting-assistant/shared';
import { useAuth } from '../../hooks/useAuth';
import { SettingsNav } from '../../components/SettingsNav';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function actorLabel(item: ActivityItem): string {
  if (!item.actor) return 'System';
  return item.actor.name || item.actor.email;
}

function targetLabel(item: ActivityItem): string {
  const email = item.metadata && typeof item.metadata.email === 'string' ? item.metadata.email : null;
  if (email) return email;
  if (item.target_type) return item.target_type;
  return '—';
}

function actionLabel(action: AuditAction): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function ActivityPage() {
  const { me } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    const appending = Boolean(cursor);
    if (appending) setLoadingMore(true);
    else setLoadingState('loading');
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/v1/tenant/activity?${params.toString()}`, {
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          body?.error?.code === 'FORBIDDEN'
            ? 'You do not have permission to view activity.'
            : 'Unable to load activity.'
        );
      }
      const page = body as ActivityListResponse;
      setItems((current) => (appending ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
      setError(null);
      setLoadingState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoadingState('error');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <SettingsNav />
      <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Activity</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Auth, invite, and membership events for {me?.tenant.name ?? 'this workspace'}.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {loadingState === 'loading' && (
        <p className="mt-6 text-sm text-[var(--color-muted)]">Loading activity…</p>
      )}

      {loadingState === 'success' && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Workspace activity</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Time
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Actor
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Action
                </th>
                <th scope="col" className="py-2 font-medium">
                  Target
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3 text-[var(--color-muted)]">{formatTime(item.created_at)}</td>
                  <td className="py-2 pr-3 font-medium">{actorLabel(item)}</td>
                  <td className="py-2 pr-3">{actionLabel(item.action)}</td>
                  <td className="py-2">{targetLabel(item)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--color-muted)]">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          className="btn-secondary mt-4"
          disabled={loadingMore}
          onClick={() => void load(nextCursor)}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
