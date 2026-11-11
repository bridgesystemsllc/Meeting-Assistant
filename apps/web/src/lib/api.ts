/**
 * API types and client utilities
 */

export interface MeetingListItem {
  id: string;
  title: string;
  platform: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  meeting_sentiment: string | null;
  engagement_score: number | null;
  action_item_count: number;
  language: string | null;
}

export interface Speaker {
  id: string;
  name: string;
  word_count: number;
  duration_ms: number;
  talk_time_pct: number;
}

export interface TranscriptResponse {
  fullText: string;
  speakers: Speaker[];
  wordCount: number;
  language: string | null;
}

export interface ActionItem {
  task: string;
  owner: string;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  context?: string;
}

export interface KeyDecision {
  decision: string;
  owner?: string;
  context?: string;
}

export interface MeetingMetrics {
  overall_sentiment: string;
  engagement_score: number | null;
}

export interface MeetingAnalysis {
  summary: string;
  key_decisions: KeyDecision[];
  action_items: ActionItem[];
  topics_discussed: unknown[];
  meeting_metrics: MeetingMetrics;
  questions_unresolved: unknown[];
  risks_and_blockers: unknown[];
  next_meeting_suggestions: {
    recommended_agenda: string[];
  };
}

export interface MeetingDetailResponse {
  meeting: {
    id: string;
    title: string;
    platform: string;
    meeting_url: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    recall_bot_id: string | null;
  };
  transcript: TranscriptResponse | null;
  analysis: MeetingAnalysis | null;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  service: string;
  checks: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}
