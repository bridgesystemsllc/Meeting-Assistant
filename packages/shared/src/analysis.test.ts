import { describe, it, expect } from 'vitest';
import {
  MeetingAnalysisSchema,
  parseAnalysisResponse,
  safeParseAnalysis,
} from './analysis.js';

describe('MeetingAnalysisSchema', () => {
  const validAnalysis = {
    summary: 'This was a productive Q2 planning meeting.',
    key_decisions: [
      { decision: 'Launch LATAM pilot', owner: 'Sarah', context: 'New market expansion' },
    ],
    action_items: [
      { task: 'Create LATAM deck', owner: 'Sarah', due_date: '2026-11-15', priority: 'high' as const },
    ],
    topics_discussed: [
      { topic: 'Q2 Revenue', summary: 'Tracking 18% above Q1', sentiment: 'positive' as const, time_spent_pct: 30 },
    ],
    questions_unresolved: [
      { question: 'Budget allocation for LATAM?', raised_by: 'Speaker C' },
    ],
    risks_and_blockers: [
      { risk: 'LATAM regulatory compliance', severity: 'medium' as const, owner: 'Legal' },
    ],
    meeting_metrics: {
      overall_sentiment: 'positive' as const,
      meeting_effectiveness: 'high' as const,
      engagement_score: 85,
      dominant_speaker: 'Speaker A',
    },
    next_meeting_suggestions: {
      recommended_agenda: ['Review LATAM pilot progress', 'Q2 revenue check-in'],
    },
  };

  it('parses valid analysis', () => {
    const result = MeetingAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it('requires summary field', () => {
    const { summary: _summary, ...withoutSummary } = validAnalysis;
    const result = MeetingAnalysisSchema.safeParse(withoutSummary);
    expect(result.success).toBe(false);
  });

  it('validates action item priority enum', () => {
    const invalid = {
      ...validAnalysis,
      action_items: [{ task: 'Test', owner: 'Me', due_date: null, priority: 'urgent' }],
    };
    const result = MeetingAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates sentiment enum', () => {
    const invalid = {
      ...validAnalysis,
      meeting_metrics: { ...validAnalysis.meeting_metrics, overall_sentiment: 'amazing' },
    };
    const result = MeetingAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('parseAnalysisResponse', () => {
  it('throws on invalid input', () => {
    expect(() => parseAnalysisResponse({})).toThrow();
    expect(() => parseAnalysisResponse(null)).toThrow();
  });
});

describe('safeParseAnalysis', () => {
  it('returns null on invalid input', () => {
    expect(safeParseAnalysis({})).toBeNull();
    expect(safeParseAnalysis(null)).toBeNull();
    expect(safeParseAnalysis('not an object')).toBeNull();
  });

  it('returns parsed data on valid input', () => {
    const valid = {
      summary: 'Test summary',
      key_decisions: [],
      action_items: [],
      topics_discussed: [],
      questions_unresolved: [],
      risks_and_blockers: [],
      meeting_metrics: {
        overall_sentiment: 'neutral',
        meeting_effectiveness: 'medium',
        engagement_score: 50,
        dominant_speaker: null,
      },
    };
    const result = safeParseAnalysis(valid);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Test summary');
  });
});
