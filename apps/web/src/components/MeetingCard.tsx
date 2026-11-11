import { Clock, CheckCircle2 } from 'lucide-react';
import type { MeetingListItem } from '../lib/api';

const platformColors: Record<string, string> = {
  zoom: 'bg-blue-500',
  google_meet: 'bg-green-500',
  teams: 'bg-indigo-500',
  webex: 'bg-orange-500',
};

const platformLabels: Record<string, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Teams',
  webex: 'Webex',
};

const statusVariants: Record<string, string> = {
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  recording: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse',
  processing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  consent_denied: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  bot_joining: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface MeetingCardProps {
  meeting: MeetingListItem;
}

export function MeetingCard({ meeting }: MeetingCardProps) {
  return (
    <div className="card cursor-pointer p-5 hover:bg-[var(--color-bg)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              platformColors[meeting.platform] || 'bg-gray-500'
            }`}
          />
          <div>
            <h3 className="font-semibold text-[var(--color-fg)]">{meeting.title}</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span>{platformLabels[meeting.platform] || meeting.platform}</span>
              {meeting.started_at && (
                <span>
                  {new Date(meeting.started_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(meeting.duration_seconds)}
              </span>
              {meeting.language && (
                <span className="uppercase">{meeting.language}</span>
              )}
            </div>
          </div>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
            statusVariants[meeting.status] || 'border-[var(--color-border)] text-[var(--color-muted)]'
          }`}
        >
          {meeting.status.replace('_', ' ')}
        </span>
      </div>

      {meeting.summary && (
        <p className="mb-3 line-clamp-2 text-sm text-[var(--color-muted)]">{meeting.summary}</p>
      )}

      {meeting.status === 'completed' && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {meeting.action_item_count > 0 && (
            <span className="flex items-center gap-1 font-medium text-[var(--color-fg)]">
              <CheckCircle2 className="w-3 h-3" />
              {meeting.action_item_count} action items
            </span>
          )}
          {meeting.engagement_score && (
            <span>{meeting.engagement_score}% engagement</span>
          )}
          {meeting.meeting_sentiment && (
            <span
              className={`px-2 py-0.5 rounded text-xs ${
                meeting.meeting_sentiment === 'positive'
                  ? 'bg-green-500/20 text-green-400'
                  : meeting.meeting_sentiment === 'negative'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {meeting.meeting_sentiment}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
