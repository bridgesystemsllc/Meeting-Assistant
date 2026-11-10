import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2, AlertCircle, Calendar } from 'lucide-react';
import { MeetingCard } from '../components/MeetingCard';
import type { MeetingListItem } from '../lib/api';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

const statusFilters = ['All', 'Completed', 'In Progress', 'Failed'] as const;

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchMeetings() {
      setLoadingState('loading');
      try {
        const res = await fetch('/api/v1/meetings', { credentials: 'include' });
        if (!res.ok) {
          throw new Error('Failed to fetch meetings');
        }
        const data = await res.json();
        setMeetings(data.meetings);
        setLoadingState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoadingState('error');
      }
    }

    fetchMeetings();
  }, []);

  let filtered = meetings;
  if (activeFilter === 'Completed') {
    filtered = filtered.filter((m) => m.status === 'completed');
  }
  if (activeFilter === 'In Progress') {
    filtered = filtered.filter((m) => ['recording', 'processing', 'bot_joining'].includes(m.status));
  }
  if (activeFilter === 'Failed') {
    filtered = filtered.filter((m) => m.status === 'failed');
  }
  if (search) {
    filtered = filtered.filter((m) =>
      m.title.toLowerCase().includes(search.toLowerCase())
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-fg)]">Meetings</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings..."
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-4 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-fg)] sm:w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {statusFilters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
              activeFilter === f
                ? 'bg-[var(--color-fg)] text-[var(--color-surface)]'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-fg)]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loadingState === 'loading' && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {loadingState === 'error' && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="mb-2 font-medium text-[var(--color-danger)]">Failed to load meetings</p>
          <p className="text-sm text-[var(--color-muted)]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 btn-primary text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {loadingState === 'success' && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="w-12 h-12 text-gray-600 mb-4" />
          <p className="mb-2 font-medium text-[var(--color-fg)]">No meetings found</p>
          <p className="text-sm text-[var(--color-muted)]">
            {search ? 'Try a different search term' : 'Your meetings will appear here'}
          </p>
        </div>
      )}

      {/* Success state */}
      {loadingState === 'success' && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((meeting) => (
            <Link key={meeting.id} to={`/meetings/${meeting.id}`}>
              <MeetingCard meeting={meeting} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
