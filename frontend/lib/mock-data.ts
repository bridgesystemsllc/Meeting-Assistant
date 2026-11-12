export type ActionItem = {
  id: string;
  task: string;
  owner: string;
  priority: "high" | "medium" | "low";
  due_date: string | null;
  completed: boolean;
  meeting_id: string;
  meeting_title: string;
};

export type Speaker = {
  id: string;
  name: string;
  talk_time_pct: number;
};

export type Meeting = {
  id: string;
  title: string;
  platform: "zoom" | "google_meet" | "teams";
  started_at: string;
  duration_seconds: number;
  status: "completed" | "recording" | "processing" | "failed";
  summary: string | null;
  meeting_sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
  engagement_score: number | null;
  action_items: ActionItem[];
  key_decisions: { decision: string; owner: string }[];
  speakers: Speaker[];
  risks: { risk: string; severity: "high" | "medium" | "low" }[];
  topics: { topic: string; time_spent_pct: number; sentiment: string }[];
  questions_unresolved: { question: string; raised_by: string }[];
};

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: "1",
    title: "Q2 Revenue Planning",
    platform: "google_meet",
    started_at: "2026-02-28T14:00:00Z",
    duration_seconds: 3600,
    status: "completed",
    summary:
      "Discussed Q2 revenue targets and identified three key growth levers: enterprise upsell, new market expansion into LATAM, and product-led growth initiatives. Team aligned on 25% QoQ target.",
    meeting_sentiment: "positive",
    engagement_score: 82,
    action_items: [
      { id: "a1", task: "Create LATAM market entry deck", owner: "Sarah", priority: "high", due_date: "2026-03-07", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
      { id: "a2", task: "Define enterprise upsell criteria", owner: "Marcus", priority: "high", due_date: "2026-03-05", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
      { id: "a3", task: "Pull PLG conversion metrics", owner: "Dev", priority: "medium", due_date: "2026-03-10", completed: false, meeting_id: "1", meeting_title: "Q2 Revenue Planning" },
    ],
    key_decisions: [
      { decision: "Prioritize enterprise tier over SMB for Q2", owner: "Leadership" },
      { decision: "Allocate budget for LATAM pilot campaign", owner: "Finance" },
    ],
    speakers: [
      { id: "A", name: "Alex", talk_time_pct: 38 },
      { id: "B", name: "Sarah", talk_time_pct: 29 },
      { id: "C", name: "Marcus", talk_time_pct: 22 },
      { id: "D", name: "Dev", talk_time_pct: 11 },
    ],
    risks: [{ risk: "LATAM compliance requirements unclear", severity: "medium" }],
    topics: [
      { topic: "Revenue Targets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "LATAM Expansion", time_spent_pct: 30, sentiment: "positive" },
      { topic: "PLG Strategy", time_spent_pct: 20, sentiment: "neutral" },
      { topic: "Team Capacity", time_spent_pct: 15, sentiment: "negative" },
    ],
    questions_unresolved: [
      { question: "What are the specific LATAM compliance requirements?", raised_by: "Marcus" },
    ],
  },
  {
    id: "2",
    title: "Engineering Sprint Review",
    platform: "zoom",
    started_at: "2026-03-01T10:00:00Z",
    duration_seconds: 2700,
    status: "completed",
    summary:
      "Sprint 24 review covered 8 of 10 planned tickets. Two tickets slipped due to API integration complexity. Team velocity is 34 story points, down from 40 last sprint.",
    meeting_sentiment: "neutral",
    engagement_score: 71,
    action_items: [
      { id: "a4", task: "Resolve Stripe API breaking change", owner: "Jared", priority: "high", due_date: "2026-03-03", completed: false, meeting_id: "2", meeting_title: "Engineering Sprint Review" },
      { id: "a5", task: "Document new auth flow", owner: "Chase", priority: "medium", due_date: "2026-03-06", completed: true, meeting_id: "2", meeting_title: "Engineering Sprint Review" },
    ],
    key_decisions: [{ decision: "Dedicate 20% of next sprint to tech debt", owner: "Jared" }],
    speakers: [
      { id: "A", name: "Jared", talk_time_pct: 45 },
      { id: "B", name: "Chase", talk_time_pct: 35 },
      { id: "C", name: "Alex", talk_time_pct: 20 },
    ],
    risks: [{ risk: "Sprint velocity declining for 3rd consecutive sprint", severity: "high" }],
    topics: [
      { topic: "Sprint Velocity", time_spent_pct: 40, sentiment: "negative" },
      { topic: "Completed Tickets", time_spent_pct: 35, sentiment: "positive" },
      { topic: "Next Sprint Planning", time_spent_pct: 25, sentiment: "neutral" },
    ],
    questions_unresolved: [],
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
    topics: [],
    questions_unresolved: [],
  },
];

export const ALL_ACTION_ITEMS: ActionItem[] = MOCK_MEETINGS.flatMap(
  (m) => m.action_items
);
