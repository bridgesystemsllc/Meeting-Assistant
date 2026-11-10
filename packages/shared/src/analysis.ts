/**
 * Zod schemas for Claude AI analysis output
 */

import { z } from 'zod';

/**
 * Action item from meeting analysis
 */
export const ActionItemSchema = z.object({
  task: z.string().describe('Specific actionable task'),
  owner: z.string().describe('Person assigned'),
  due_date: z.string().nullable().describe('Due date or null if not specified'),
  priority: z.enum(['high', 'medium', 'low']),
  context: z.string().optional().describe('Brief context'),
});

export type ActionItem = z.infer<typeof ActionItemSchema>;

/**
 * Key decision from meeting
 */
export const KeyDecisionSchema = z.object({
  decision: z.string().describe('The decision made'),
  owner: z.string().nullable().describe('Person responsible'),
  context: z.string().optional().describe('Why this decision was made'),
});

export type KeyDecision = z.infer<typeof KeyDecisionSchema>;

/**
 * Topic discussed in meeting
 */
export const TopicSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  time_spent_pct: z.number().min(0).max(100),
});

export type Topic = z.infer<typeof TopicSchema>;

/**
 * Unresolved question from meeting
 */
export const UnresolvedQuestionSchema = z.object({
  question: z.string(),
  raised_by: z.string(),
});

export type UnresolvedQuestion = z.infer<typeof UnresolvedQuestionSchema>;

/**
 * Risk or blocker identified
 */
export const RiskSchema = z.object({
  risk: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  owner: z.string().nullable(),
});

export type Risk = z.infer<typeof RiskSchema>;

/**
 * Meeting metrics from analysis
 */
export const MeetingMetricsSchema = z.object({
  overall_sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  meeting_effectiveness: z.enum(['high', 'medium', 'low']),
  meeting_effectiveness_reason: z.string().optional(),
  engagement_score: z.number().min(0).max(100),
  dominant_speaker: z.string().nullable(),
  key_highlights: z.array(z.string()).optional(),
});

export type MeetingMetrics = z.infer<typeof MeetingMetricsSchema>;

/**
 * Next meeting suggestions
 */
export const NextMeetingSuggestionsSchema = z.object({
  recommended_agenda: z.array(z.string()),
  participants_needed: z.array(z.string()).optional(),
  suggested_duration_minutes: z.number().optional(),
});

export type NextMeetingSuggestions = z.infer<typeof NextMeetingSuggestionsSchema>;

/**
 * Complete meeting analysis output from Claude
 */
export const MeetingAnalysisSchema = z.object({
  summary: z.string().describe('3-5 sentence executive summary'),
  key_decisions: z.array(KeyDecisionSchema),
  action_items: z.array(ActionItemSchema),
  topics_discussed: z.array(TopicSchema),
  questions_unresolved: z.array(UnresolvedQuestionSchema),
  risks_and_blockers: z.array(RiskSchema),
  meeting_metrics: MeetingMetricsSchema,
  next_meeting_suggestions: NextMeetingSuggestionsSchema.optional(),
  follow_up_email_draft: z.string().optional(),
});

export type MeetingAnalysis = z.infer<typeof MeetingAnalysisSchema>;

/**
 * Validates and parses AI analysis response
 */
export function parseAnalysisResponse(raw: unknown): MeetingAnalysis {
  return MeetingAnalysisSchema.parse(raw);
}

/**
 * Safely parses AI response with fallback for malformed JSON
 */
export function safeParseAnalysis(raw: unknown): MeetingAnalysis | null {
  const result = MeetingAnalysisSchema.safeParse(raw);
  return result.success ? result.data : null;
}
