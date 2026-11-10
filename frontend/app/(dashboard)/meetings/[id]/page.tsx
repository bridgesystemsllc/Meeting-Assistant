"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Share2, Download, Mail } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ActionItemRow } from "@/components/dashboard/ActionItemRow";
import { MOCK_MEETINGS } from "@/lib/mock-data";

const tabs = ["Summary", "Action Items", "Transcript", "Analytics"] as const;
const MOCK_TRANSCRIPT = `[00:00] Speaker A: Good morning everyone, thanks for joining the Q2 planning session.
[00:15] Speaker B: I've prepared the revenue analysis. We're currently tracking at 18% above Q1.
[00:45] Speaker A: That's great news. Let's talk about where we want to be by end of Q2.
[01:20] Speaker C: I think LATAM is a huge opportunity we've been sleeping on.
[02:10] Speaker B: Agreed. I'd propose we allocate budget for a pilot campaign.
[03:00] Speaker A: Let's make a decision on that today. Marcus, can you define the enterprise upsell criteria by Thursday?
[03:15] Speaker C: Absolutely, I'll have that ready.
[04:30] Speaker B: Sarah, can you build the LATAM market entry deck for the board?
[05:00] Speaker A: Perfect. Let's circle back on PLG metrics next week.`;

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function MeetingDetailPage() {
  const params = useParams();
  const meeting = MOCK_MEETINGS.find((m) => m.id === params.id);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Summary");

  if (!meeting) {
    return (<div className="text-center py-20"><p className="text-text-muted">Meeting not found.</p><Link href="/meetings" className="text-violet text-sm mt-2 inline-block">Back to meetings</Link></div>);
  }

  if (meeting.status === "recording") {
    return (<div className="text-center py-32"><div className="w-4 h-4 rounded-full bg-negative animate-pulse-slow mx-auto mb-4" /><h2 className="text-xl font-bold mb-2">Meeting In Progress</h2><p className="text-text-secondary text-sm">Bot is recording. Notes will be generated when the meeting ends.</p></div>);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/meetings" className="flex items-center gap-1 text-text-muted hover:text-text-primary text-sm mb-4 transition-colors"><ArrowLeft className="w-4 h-4" />Back to meetings</Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-sm text-text-muted flex-wrap">
              <span>{new Date(meeting.started_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              <span>{formatDuration(meeting.duration_seconds)}</span>
              {meeting.meeting_sentiment && <Badge variant={meeting.meeting_sentiment === "positive" ? "positive" : meeting.meeting_sentiment === "negative" ? "negative" : "neutral"}>{meeting.meeting_sentiment}</Badge>}
              {meeting.engagement_score && <span className="text-violet font-medium">{meeting.engagement_score}% engagement</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5"><Share2 className="w-4 h-4" /> Share</button>
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5"><Download className="w-4 h-4" /> Export</button>
            <button className="btn-outline text-sm py-2 px-3 flex items-center gap-1.5"><Mail className="w-4 h-4" /> Email</button>
          </div>
        </div>
      </div>
      <div className="flex border-b border-border-subtle mb-6 overflow-x-auto">
        {tabs.map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-violet text-violet" : "border-transparent text-text-secondary hover:text-text-primary"}`}>{tab}</button>))}
      </div>

      {activeTab === "Summary" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Executive Summary</h3>
            <p className="text-text-primary leading-relaxed">{meeting.summary}</p>
          </div>
          {meeting.key_decisions.length > 0 && (<div><h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Key Decisions</h3><div className="space-y-2">{meeting.key_decisions.map((d, i) => (<div key={i} className="card p-4 flex items-start gap-3"><span className="text-violet mt-0.5">&#x2192;</span><div><p className="text-sm font-medium text-text-primary">{d.decision}</p><p className="text-xs text-text-muted mt-1">Owner: {d.owner}</p></div></div>))}</div></div>)}
          {meeting.topics.length > 0 && (<div><h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Topics Discussed</h3><div className="flex flex-wrap gap-2">{meeting.topics.map((t, i) => (<div key={i} className={`px-3 py-2 rounded-md border text-sm ${t.sentiment === "positive" ? "bg-positive/5 border-positive/20 text-positive" : t.sentiment === "negative" ? "bg-negative/5 border-negative/20 text-negative" : "bg-neutral/5 border-neutral/20 text-neutral"}`}><span className="font-medium">{t.topic}</span><span className="text-xs opacity-70 ml-2">{t.time_spent_pct}%</span></div>))}</div></div>)}
          {meeting.risks.length > 0 && (<div><h3 className="text-sm font-semibold text-negative uppercase tracking-wide mb-3">Risks &amp; Blockers</h3><div className="space-y-2">{meeting.risks.map((r, i) => (<div key={i} className="bg-negative/5 border border-negative/20 rounded-md p-4"><p className="text-sm font-medium text-text-primary">{r.risk}</p><Badge variant={r.severity === "high" ? "negative" : r.severity === "medium" ? "warning" : "positive"} className="mt-2">{r.severity}</Badge></div>))}</div></div>)}
          {meeting.questions_unresolved.length > 0 && (<div><h3 className="text-sm font-semibold text-warning uppercase tracking-wide mb-3">Unresolved Questions</h3><div className="space-y-2">{meeting.questions_unresolved.map((q, i) => (<div key={i} className="bg-warning/5 border border-warning/20 rounded-md p-4"><p className="text-sm text-text-primary">{q.question}</p><p className="text-xs text-text-muted mt-1">Raised by: {q.raised_by}</p></div>))}</div></div>)}
        </div>
      )}

      {activeTab === "Action Items" && (<div className="space-y-2">{meeting.action_items.length > 0 ? meeting.action_items.map((item) => <ActionItemRow key={item.id} item={item} />) : <p className="text-text-muted text-sm text-center py-12">No action items identified.</p>}</div>)}

      {activeTab === "Transcript" && (<div><div className="bg-surface border border-border-subtle rounded-md p-6 font-mono text-sm text-text-secondary leading-loose whitespace-pre-wrap max-h-[600px] overflow-y-auto">{MOCK_TRANSCRIPT}</div></div>)}

      {activeTab === "Analytics" && (
        <div className="space-y-6">
          {meeting.speakers.length > 0 && (<div><h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-4">Talk Time Distribution</h3>{meeting.speakers.map((s) => (<div key={s.id} className="mb-4"><div className="flex justify-between text-sm mb-1.5"><span className="text-text-primary font-medium">{s.name}</span><span className="text-text-muted">{s.talk_time_pct}%</span></div><div className="h-2.5 bg-elevated rounded-full overflow-hidden"><div className="h-full bg-violet rounded-full transition-all" style={{ width: `${s.talk_time_pct}%` }} /></div></div>))}</div>)}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Duration", value: formatDuration(meeting.duration_seconds), color: "text-text-primary" },
              { label: "Engagement", value: `${meeting.engagement_score}%`, color: "text-violet" },
              { label: "Action Items", value: String(meeting.action_items.length), color: "text-positive" },
              { label: "Decisions", value: String(meeting.key_decisions.length), color: "text-warning" },
            ].map((stat) => (<div key={stat.label} className="card p-5 text-center"><p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p><p className="text-xs text-text-muted mt-1">{stat.label}</p></div>))}
          </div>
        </div>
      )}
    </div>
  );
}
