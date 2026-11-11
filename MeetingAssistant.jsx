import { useState, useEffect } from "react";

// =============================================
// MOCK DATA (replace with real API calls)
// =============================================
const MOCK_MEETINGS = [
  {
    id: "1",
    title: "Q2 Revenue Planning",
    platform: "google_meet",
    started_at: "2026-02-28T14:00:00Z",
    duration_seconds: 3600,
    status: "completed",
    summary: "Discussed Q2 revenue targets and identified three key growth levers: enterprise upsell, new market expansion into LATAM, and product-led growth initiatives. Team aligned on 25% QoQ target.",
    meeting_sentiment: "positive",
    engagement_score: 82,
    action_items: [
      { task: "Create LATAM market entry deck", owner: "Sarah", priority: "high", due_date: "Mar 7" },
      { task: "Define enterprise upsell criteria", owner: "Marcus", priority: "high", due_date: "Mar 5" },
      { task: "Pull PLG conversion metrics", owner: "Dev", priority: "medium", due_date: "Mar 10" },
    ],
    key_decisions: [
      { decision: "Prioritize enterprise tier over SMB for Q2", owner: "Leadership" },
      { decision: "Allocate $50K for LATAM pilot campaign", owner: "Finance" },
    ],
    speakers: [
      { id: "A", name: "Alex", talk_time_pct: 38 },
      { id: "B", name: "Sarah", talk_time_pct: 29 },
      { id: "C", name: "Marcus", talk_time_pct: 22 },
      { id: "D", name: "Dev", talk_time_pct: 11 },
    ],
    risks: [
      { risk: "LATAM compliance requirements unclear", severity: "medium" },
    ],
    topics: [
      { topic: "Revenue Targets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "LATAM Expansion", time_spent_pct: 30, sentiment: "positive" },
      { topic: "PLG Strategy", time_spent_pct: 20, sentiment: "neutral" },
      { topic: "Team Capacity", time_spent_pct: 15, sentiment: "negative" },
    ]
  },
  {
    id: "2",
    title: "Engineering Sprint Review",
    platform: "zoom",
    started_at: "2026-03-01T10:00:00Z",
    duration_seconds: 2700,
    status: "completed",
    summary: "Sprint 24 review covered 8 of 10 planned tickets. Two tickets slipped due to API integration complexity. Team velocity is 34 story points, down from 40 last sprint due to technical debt work.",
    meeting_sentiment: "neutral",
    engagement_score: 71,
    action_items: [
      { task: "Resolve Stripe API breaking change", owner: "Jared", priority: "high", due_date: "Today" },
      { task: "Document new auth flow", owner: "Chase", priority: "medium", due_date: "Mar 6" },
    ],
    key_decisions: [
      { decision: "Dedicate 20% of next sprint to tech debt", owner: "Jared" },
    ],
    speakers: [
      { id: "A", name: "Jared", talk_time_pct: 45 },
      { id: "B", name: "Chase", talk_time_pct: 35 },
      { id: "C", name: "Alex", talk_time_pct: 20 },
    ],
    risks: [
      { risk: "Sprint velocity declining for 3rd consecutive sprint", severity: "high" },
    ],
    topics: [
      { topic: "Sprint Velocity", time_spent_pct: 40, sentiment: "negative" },
      { topic: "Completed Tickets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "Next Sprint Planning", time_spent_pct: 25, sentiment: "neutral" },
    ]
  },
  {
    id: "3",
    title: "Lumen & Vale Onboarding Call",
    platform: "zoom",
    started_at: "2026-03-02T09:00:00Z",
    duration_seconds: 5400,
    status: "recording",
    summary: null,
    meeting_sentiment: null,
    engagement_score: null,
    action_items: [],
    key_decisions: [],
    speakers: [],
    risks: [],
    topics: []
  }
];

// =============================================
// UTILITY FUNCTIONS
// =============================================
const formatDuration = (seconds) => {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const platformIcon = (platform) => {
  const icons = { zoom: "🔵", google_meet: "🟢", teams: "🟣" };
  return icons[platform] || "⚫";
};

const sentimentColor = {
  positive: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  negative: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  neutral: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  mixed: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  recording: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
};

const priorityColor = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-emerald-100 text-emerald-700",
};

// =============================================
// COMPONENTS
// =============================================

const StatusBadge = ({ status, sentiment }) => {
  const label = status === "completed" ? (sentiment || "neutral") : status.replace("_", " ");
  const colors = sentimentColor[status === "recording" ? "recording" : (sentiment || "neutral")];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} ${status === "recording" ? "animate-pulse" : ""}`}></span>
      {label}
    </span>
  );
};

const MeetingCard = ({ meeting, onClick, isSelected }) => (
  <div
    onClick={() => onClick(meeting)}
    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
      isSelected ? "border-indigo-500 bg-indigo-50 shadow-md" : "border-slate-200 bg-white hover:border-slate-300"
    }`}
  >
    <div className="flex items-start justify-between gap-2 mb-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{platformIcon(meeting.platform)}</span>
        <span className="font-semibold text-slate-800 text-sm leading-tight">{meeting.title}</span>
      </div>
      <StatusBadge status={meeting.status} sentiment={meeting.meeting_sentiment} />
    </div>
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>📅 {formatDate(meeting.started_at)}</span>
      <span>⏱ {formatDuration(meeting.duration_seconds)}</span>
      {meeting.action_items?.length > 0 && (
        <span className="text-indigo-600 font-medium">✅ {meeting.action_items.length} actions</span>
      )}
    </div>
    {meeting.summary && (
      <p className="mt-2 text-xs text-slate-500 line-clamp-2">{meeting.summary}</p>
    )}
  </div>
);

const SpeakerBar = ({ speaker }) => (
  <div className="mb-3">
    <div className="flex justify-between text-sm mb-1">
      <span className="font-medium text-slate-700">{speaker.name}</span>
      <span className="text-slate-500">{speaker.talk_time_pct}%</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-indigo-500 rounded-full transition-all"
        style={{ width: `${speaker.talk_time_pct}%` }}
      />
    </div>
  </div>
);

const ActionItem = ({ item }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
    <div className="mt-0.5 w-5 h-5 rounded border-2 border-slate-300 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-slate-800">{item.task}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-xs text-slate-500">👤 {item.owner}</span>
        {item.due_date && <span className="text-xs text-slate-500">📅 {item.due_date}</span>}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[item.priority]}`}>
          {item.priority}
        </span>
      </div>
    </div>
  </div>
);

const TopicPill = ({ topic }) => {
  const colors = {
    positive: "bg-emerald-50 border-emerald-200 text-emerald-700",
    negative: "bg-red-50 border-red-200 text-red-700",
    neutral: "bg-slate-50 border-slate-200 text-slate-600",
  };
  return (
    <div className={`px-3 py-2 rounded-lg border text-sm ${colors[topic.sentiment]}`}>
      <div className="font-medium">{topic.topic}</div>
      <div className="text-xs opacity-70 mt-0.5">{topic.time_spent_pct}% of meeting</div>
    </div>
  );
};

const JoinMeetingModal = ({ isOpen, onClose }) => {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!url) return;
    setLoading(true);
    // In production: POST /api/meetings/join
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    alert("🤖 Bot is joining your meeting! You'll receive notes when it ends.");
    onClose();
    setUrl(""); setTitle("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-slate-800 mb-4">🤖 Join a Meeting</h2>
        <p className="text-sm text-slate-500 mb-5">Paste your meeting link and our bot will join, record, and generate AI notes automatically.</p>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Meeting URL *</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://zoom.us/j/... or meet.google.com/..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Q2 Planning Meeting"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            ✅ Supports Zoom, Google Meet & Microsoft Teams
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!url || loading}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Deploying Bot..." : "🚀 Send Bot"}
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailPanel = ({ meeting }) => {
  const [activeTab, setActiveTab] = useState("summary");

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <div className="text-center">
          <div className="text-5xl mb-3">📋</div>
          <p className="text-slate-500 font-medium">Select a meeting to view details</p>
          <p className="text-slate-400 text-sm mt-1">Your meeting notes and analysis will appear here</p>
        </div>
      </div>
    );
  }

  if (meeting.status === "recording") {
    return (
      <div className="flex-1 flex items-center justify-center bg-blue-50 rounded-2xl border-2 border-blue-200">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-pulse">🔴</div>
          <p className="text-blue-700 font-bold text-lg">Meeting In Progress</p>
          <p className="text-blue-500 text-sm mt-1">Bot is recording. Notes will be generated when the meeting ends.</p>
        </div>
      </div>
    );
  }

  const tabs = ["summary", "actions", "transcript", "analytics"];

  return (
    <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-xl font-bold text-slate-800">{meeting.title}</h2>
          <StatusBadge status={meeting.status} sentiment={meeting.meeting_sentiment} />
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span>{platformIcon(meeting.platform)} {meeting.platform?.replace("_", " ")}</span>
          <span>📅 {formatDate(meeting.started_at)}</span>
          <span>⏱ {formatDuration(meeting.duration_seconds)}</span>
          {meeting.engagement_score && (
            <span className="text-indigo-600 font-medium">⚡ {meeting.engagement_score}% engagement</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-5">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3 px-4 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-5">
        
        {/* SUMMARY TAB */}
        {activeTab === "summary" && (
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-slate-700 mb-2">📝 Executive Summary</h3>
              <p className="text-slate-600 leading-relaxed text-sm">{meeting.summary}</p>
            </div>

            {meeting.key_decisions?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 mb-2">🎯 Key Decisions</h3>
                <div className="space-y-2">
                  {meeting.key_decisions.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                      <span className="text-indigo-500 mt-0.5">→</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{d.decision}</p>
                        {d.owner && <p className="text-xs text-slate-500 mt-0.5">Owner: {d.owner}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {meeting.topics?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 mb-2">💬 Topics Discussed</h3>
                <div className="grid grid-cols-2 gap-2">
                  {meeting.topics.map((t, i) => <TopicPill key={i} topic={t} />)}
                </div>
              </div>
            )}

            {meeting.risks?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 mb-2 text-red-600">⚠️ Risks & Blockers</h3>
                <div className="space-y-2">
                  {meeting.risks.map((r, i) => (
                    <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-lg">
                      <p className="text-sm text-red-800 font-medium">{r.risk}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${priorityColor[r.severity]}`}>{r.severity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTIONS TAB */}
        {activeTab === "actions" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-700">✅ Action Items ({meeting.action_items?.length || 0})</h3>
            </div>
            {meeting.action_items?.length > 0 ? (
              <div className="space-y-2">
                {meeting.action_items.map((item, i) => <ActionItem key={i} item={item} />)}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No action items identified in this meeting.</p>
            )}
          </div>
        )}

        {/* TRANSCRIPT TAB */}
        {activeTab === "transcript" && (
          <div>
            <h3 className="font-semibold text-slate-700 mb-3">📄 Transcript</h3>
            <div className="bg-slate-50 rounded-xl p-4 font-mono text-xs text-slate-600 leading-relaxed max-h-96 overflow-y-auto">
              {`[00:00] Speaker A: Good morning everyone, thanks for joining the Q2 planning session. Let's get started.\n\n[00:15] Speaker B: I've prepared the revenue analysis. We're currently tracking at 18% above Q1.\n\n[00:45] Speaker A: That's great news. Let's talk about where we want to be by end of Q2...\n\n[01:20] Speaker C: I think LATAM is a huge opportunity we've been sleeping on. The market data looks strong.\n\n[02:10] Speaker B: Agreed. I'd propose we allocate budget for a pilot campaign to test the market...\n\n[03:00] Speaker A: Let's make a decision on that today. Marcus, can you define the enterprise upsell criteria by Thursday?\n\n[03:15] Speaker C: Absolutely, I'll have that ready.\n\n[04:30] Speaker B: Sarah, can you build the LATAM market entry deck for the board?\n\n[04:38] Speaker B: I'll need it by next Friday for the board meeting.\n\n[05:00] Speaker A: Perfect. Let's circle back on PLG metrics next week...`}
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === "analytics" && (
          <div className="space-y-5">
            {meeting.speakers?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 mb-3">🎙 Talk Time Distribution</h3>
                {meeting.speakers.map((s, i) => <SpeakerBar key={i} speaker={s} />)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-indigo-600">{meeting.engagement_score}%</div>
                <div className="text-xs text-slate-500 mt-1">Engagement Score</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-emerald-600">{meeting.action_items?.length || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Action Items Created</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-amber-600">{meeting.key_decisions?.length || 0}</div>
                <div className="text-xs text-slate-500 mt-1">Decisions Made</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl text-center">
                <div className="text-3xl font-bold text-slate-600">{formatDuration(meeting.duration_seconds)}</div>
                <div className="text-xs text-slate-500 mt-1">Meeting Duration</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================
// MAIN APP
// =============================================

export default function MeetingAssistant() {
  const [meetings, setMeetings] = useState(MOCK_MEETINGS);
  const [selectedMeeting, setSelectedMeeting] = useState(MOCK_MEETINGS[0]);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = meetings.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: meetings.length,
    completed: meetings.filter(m => m.status === "completed").length,
    totalActions: meetings.reduce((sum, m) => sum + (m.action_items?.length || 0), 0),
    avgEngagement: Math.round(
      meetings.filter(m => m.engagement_score).reduce((sum, m) => sum + m.engagement_score, 0) /
      meetings.filter(m => m.engagement_score).length
    ) || 0
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Meeting Assistant</h1>
            <p className="text-sm text-slate-500">AI-powered notes, summaries & action items</p>
          </div>
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors shadow-sm"
          >
            🤖 Join Meeting
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Meetings", value: stats.total, icon: "📅" },
            { label: "Completed", value: stats.completed, icon: "✅" },
            { label: "Action Items", value: stats.totalActions, icon: "📋" },
            { label: "Avg Engagement", value: `${stats.avgEngagement}%`, icon: "⚡" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-slate-200">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-bold text-slate-800">{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Main Layout */}
        <div className="flex gap-4" style={{ height: "600px" }}>

          {/* Meeting List */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            <input
              type="text"
              placeholder="🔍 Search meetings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filtered.map(meeting => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onClick={setSelectedMeeting}
                  isSelected={selectedMeeting?.id === meeting.id}
                />
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          <DetailPanel meeting={selectedMeeting} />
        </div>
      </div>

      <JoinMeetingModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
    </div>
  );
}
