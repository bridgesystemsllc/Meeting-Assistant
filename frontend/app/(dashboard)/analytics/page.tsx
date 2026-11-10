"use client";

import { MOCK_MEETINGS } from "@/lib/mock-data";

export default function AnalyticsPage() {
  const completed = MOCK_MEETINGS.filter((m) => m.status === "completed");
  const totalActions = completed.reduce((sum, m) => sum + m.action_items.length, 0);
  const completedActions = completed.reduce((sum, m) => sum + m.action_items.filter((a) => a.completed).length, 0);
  const avgEngagement = completed.length ? Math.round(completed.reduce((sum, m) => sum + (m.engagement_score || 0), 0) / completed.length) : 0;
  const avgDuration = completed.length ? Math.round(completed.reduce((sum, m) => sum + m.duration_seconds, 0) / completed.length / 60) : 0;

  const stats = [
    { label: "Meetings This Month", value: String(completed.length), color: "text-text-primary" },
    { label: "Action Items", value: `${completedActions}/${totalActions}`, sub: "completed", color: "text-violet" },
    { label: "Avg Engagement", value: `${avgEngagement}%`, color: "text-positive" },
    { label: "Avg Duration", value: `${avgDuration}m`, color: "text-cyan" },
  ];

  const speakerMap: Record<string, number> = {};
  completed.forEach((m) => m.speakers.forEach((s) => { speakerMap[s.name] = (speakerMap[s.name] || 0) + s.talk_time_pct; }));
  const topSpeakers = Object.entries(speakerMap).sort(([, a], [, b]) => b - a).slice(0, 6);
  const maxTalk = topSpeakers[0]?.[1] || 1;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (<div key={stat.label} className="card p-5 text-center"><p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p><p className="text-xs text-text-muted mt-1">{stat.label}</p>{stat.sub && <p className="text-xs text-text-muted">{stat.sub}</p>}</div>))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Top Speakers by Talk Time</h3>
          {topSpeakers.map(([name, pct]) => (<div key={name} className="mb-4"><div className="flex justify-between text-sm mb-1.5"><span className="text-text-primary font-medium">{name}</span><span className="text-text-muted">{pct}%</span></div><div className="h-2.5 bg-elevated rounded-full overflow-hidden"><div className="h-full bg-violet rounded-full" style={{ width: `${(pct / maxTalk) * 100}%` }} /></div></div>))}
        </div>
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Meeting Sentiment</h3>
          <div className="space-y-3">
            {completed.map((m) => (<div key={m.id} className="flex items-center justify-between"><span className="text-sm text-text-primary">{m.title}</span><span className={`text-sm font-medium ${m.meeting_sentiment === "positive" ? "text-positive" : m.meeting_sentiment === "negative" ? "text-negative" : "text-neutral"}`}>{m.meeting_sentiment}</span></div>))}
          </div>
        </div>
      </div>
    </div>
  );
}
