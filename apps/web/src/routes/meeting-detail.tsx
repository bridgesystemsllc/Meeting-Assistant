import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, Clock } from 'lucide-react';
import type { MeetingDetailResponse, ActionItem } from '../lib/api';

type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'not_found';

const tabs = ['Summary', 'Action Items', 'Transcript', 'Analytics'] as const;
type Tab = typeof tabs[number];

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    recording: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    processing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    consent_denied: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    bot_joining: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
        variants[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MeetingDetailResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Summary');

  useEffect(() => {
    async function fetchMeeting() {
      if (!id) return;
      setLoadingState('loading');
      try {
        const res = await fetch(`/api/v1/meetings/${id}`, { credentials: 'include' });
        if (!res.ok) {
          if (res.status === 404) {
            setLoadingState('not_found');
            return;
          }
          throw new Error('Failed to fetch meeting');
        }
        const json = await res.json();
        setData(json);
        setLoadingState('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoadingState('error');
      }
    }

    fetchMeeting();
  }, [id]);

  if (loadingState === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (loadingState === 'not_found') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-[var(--color-muted)]" />
        <h1 className="mb-2 text-xl font-semibold text-[var(--color-fg)]">Meeting not found</h1>
        <p className="text-sm text-[var(--color-muted)]">
          This meeting does not exist or is not in your workspace.
        </p>
        <Link to="/meetings" className="btn-primary mt-4 text-sm">
          Back to meetings
        </Link>
      </div>
    );
  }

  if (loadingState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-400 font-medium mb-2">Error</p>
        <p className="text-gray-500 text-sm">{error}</p>
        <Link to="/meetings" className="mt-4 btn-primary text-sm">
          Back to meetings
        </Link>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { meeting, transcript, analysis } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/meetings"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to meetings
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-semibold text-[var(--color-fg)]">{meeting.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
              {meeting.started_at && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {new Date(meeting.started_at).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              )}
              <span>{formatDuration(meeting.duration_seconds)}</span>
              {transcript?.language && (
                <span className="uppercase">{transcript.language}</span>
              )}
              <StatusBadge status={meeting.status} />
            </div>
          </div>
        </div>
      </div>

      {/* In-progress state */}
      {meeting.status === 'recording' && (
        <div className="card p-8 text-center">
          <div className="w-4 h-4 rounded-full bg-cyan-500 animate-pulse mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Meeting In Progress</h2>
          <p className="text-gray-400 text-sm">
            Bot is recording. Notes will be generated when the meeting ends.
          </p>
        </div>
      )}

      {/* Consent denied state */}
      {meeting.status === 'consent_denied' && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6 mb-6">
          <h3 className="text-orange-400 font-semibold mb-2">Recording Permission Denied</h3>
          <p className="text-gray-400 text-sm">
            The meeting host did not grant recording permission. No transcript is available.
          </p>
        </div>
      )}

      {/* Failed state */}
      {meeting.status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-6">
          <h3 className="text-red-400 font-semibold mb-2">Processing Failed</h3>
          <p className="text-gray-400 text-sm">
            There was an error processing this meeting. Please try again or contact support.
          </p>
        </div>
      )}

      {/* Tabs for completed meetings */}
      {meeting.status === 'completed' && (
        <>
          <div className="flex border-b border-gray-800 mb-6 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Summary Tab */}
          {activeTab === 'Summary' && analysis && (
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Executive Summary
                </h3>
                <p className="text-gray-200 leading-relaxed">{analysis.summary}</p>
              </div>

              {analysis.key_decisions && analysis.key_decisions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Key Decisions
                  </h3>
                  <div className="space-y-2">
                    {analysis.key_decisions.map((d: { decision: string; owner?: string }, i: number) => (
                      <div key={i} className="card p-4 flex items-start gap-3">
                        <span className="text-indigo-400 mt-0.5">→</span>
                        <div>
                          <p className="text-sm font-medium text-gray-200">{d.decision}</p>
                          {d.owner && (
                            <p className="text-xs text-gray-500 mt-1">Owner: {d.owner}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Items Tab */}
          {activeTab === 'Action Items' && analysis && (
            <div className="space-y-2">
              {analysis.action_items && analysis.action_items.length > 0 ? (
                analysis.action_items.map((item: ActionItem, i: number) => (
                  <div key={i} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-200">{item.task}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>Owner: {item.owner}</span>
                          {item.due_date && <span>Due: {item.due_date}</span>}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          item.priority === 'high'
                            ? 'bg-red-500/20 text-red-400'
                            : item.priority === 'medium'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-12">
                  No action items identified.
                </p>
              )}
            </div>
          )}

          {/* Transcript Tab */}
          {activeTab === 'Transcript' && (
            <div className="card p-6">
              {transcript ? (
                <pre className="font-mono text-sm text-gray-300 leading-loose whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {transcript.fullText}
                </pre>
              ) : (
                <p className="text-gray-500 text-sm text-center py-12">
                  No transcript available.
                </p>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'Analytics' && (
            <div className="space-y-6">
              {transcript?.speakers && transcript.speakers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                    Talk Time Distribution
                  </h3>
                  {transcript.speakers.map((s: { id: string; name: string; talk_time_pct: number }) => (
                    <div key={s.id} className="mb-4">
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-200 font-medium">{s.name}</span>
                        <span className="text-gray-500">{s.talk_time_pct}%</span>
                      </div>
                      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${s.talk_time_pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-5 text-center">
                  <p className="text-3xl font-black text-white">
                    {formatDuration(meeting.duration_seconds)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Duration</p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-3xl font-black text-indigo-400">
                    {analysis?.meeting_metrics?.engagement_score ?? '--'}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Engagement</p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-3xl font-black text-green-400">
                    {analysis?.action_items?.length ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Action Items</p>
                </div>
                <div className="card p-5 text-center">
                  <p className="text-3xl font-black text-yellow-400">
                    {analysis?.key_decisions?.length ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Decisions</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
