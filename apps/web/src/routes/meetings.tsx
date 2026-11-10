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
        const res = await fetch('/api/meetings');
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
        <h1 className="text-2xl font-bold text-white">Meetings</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings..."
            className="bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {statusFilters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              activeFilter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
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
          <p className="text-red-400 font-medium mb-2">Failed to load meetings</p>
          <p className="text-gray-500 text-sm">{error}</p>
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
          <p className="text-gray-400 font-medium mb-2">No meetings found</p>
          <p className="text-gray-500 text-sm">
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
