/**
 * Synthetic Recall.ai fixtures for testing
 * Uses Lumen & Vale Beauty (synthetic data only)
 */

export const SYNTHETIC_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const SYNTHETIC_USER_ID = '00000000-0000-0000-0000-000000000002';
export const SYNTHETIC_MEETING_ID = '00000000-0000-0000-0000-000000000100';
export const SYNTHETIC_BOT_ID = 'recall-bot-test-001';

/**
 * English transcript fixture
 */
export const RECALL_TRANSCRIPT_EN = {
  segments: [
    {
      speaker: 'Speaker 1',
      speaker_id: 1,
      language: 'en',
      words: [
        { text: 'Good', start_time: 0, end_time: 0.2, confidence: 0.98 },
        { text: 'morning', start_time: 0.2, end_time: 0.5, confidence: 0.99 },
        { text: 'everyone.', start_time: 0.5, end_time: 0.9, confidence: 0.97 },
        { text: 'Let\'s', start_time: 1.0, end_time: 1.2, confidence: 0.98 },
        { text: 'discuss', start_time: 1.2, end_time: 1.5, confidence: 0.99 },
        { text: 'the', start_time: 1.5, end_time: 1.6, confidence: 0.99 },
        { text: 'Q4', start_time: 1.6, end_time: 1.8, confidence: 0.95 },
        { text: 'product', start_time: 1.8, end_time: 2.1, confidence: 0.98 },
        { text: 'launch', start_time: 2.1, end_time: 2.4, confidence: 0.99 },
        { text: 'for', start_time: 2.4, end_time: 2.5, confidence: 0.99 },
        { text: 'Lumen', start_time: 2.5, end_time: 2.8, confidence: 0.97 },
        { text: '&', start_time: 2.8, end_time: 2.9, confidence: 0.99 },
        { text: 'Vale', start_time: 2.9, end_time: 3.1, confidence: 0.98 },
        { text: 'Beauty.', start_time: 3.1, end_time: 3.5, confidence: 0.99 },
      ],
    },
    {
      speaker: 'Speaker 2',
      speaker_id: 2,
      language: 'en',
      words: [
        { text: 'The', start_time: 4.0, end_time: 4.1, confidence: 0.99 },
        { text: 'new', start_time: 4.1, end_time: 4.3, confidence: 0.98 },
        { text: 'SKU-LV-1001', start_time: 4.3, end_time: 4.9, confidence: 0.95 },
        { text: 'is', start_time: 4.9, end_time: 5.0, confidence: 0.99 },
        { text: 'ready', start_time: 5.0, end_time: 5.3, confidence: 0.98 },
        { text: 'for', start_time: 5.3, end_time: 5.4, confidence: 0.99 },
        { text: 'PO-0001.', start_time: 5.4, end_time: 5.9, confidence: 0.96 },
        { text: 'We', start_time: 6.0, end_time: 6.1, confidence: 0.99 },
        { text: 'need', start_time: 6.1, end_time: 6.3, confidence: 0.98 },
        { text: 'to', start_time: 6.3, end_time: 6.4, confidence: 0.99 },
        { text: 'finalize', start_time: 6.4, end_time: 6.8, confidence: 0.97 },
        { text: 'pricing', start_time: 6.8, end_time: 7.2, confidence: 0.98 },
        { text: 'by', start_time: 7.2, end_time: 7.3, confidence: 0.99 },
        { text: 'Friday.', start_time: 7.3, end_time: 7.7, confidence: 0.99 },
      ],
    },
    {
      speaker: 'Speaker 1',
      speaker_id: 1,
      language: 'en',
      words: [
        { text: 'Agreed.', start_time: 8.0, end_time: 8.4, confidence: 0.99 },
        { text: 'Action', start_time: 8.5, end_time: 8.8, confidence: 0.98 },
        { text: 'item:', start_time: 8.8, end_time: 9.1, confidence: 0.97 },
        { text: 'Sarah', start_time: 9.1, end_time: 9.4, confidence: 0.96 },
        { text: 'will', start_time: 9.4, end_time: 9.5, confidence: 0.99 },
        { text: 'send', start_time: 9.5, end_time: 9.7, confidence: 0.98 },
        { text: 'the', start_time: 9.7, end_time: 9.8, confidence: 0.99 },
        { text: 'pricing', start_time: 9.8, end_time: 10.1, confidence: 0.98 },
        { text: 'proposal', start_time: 10.1, end_time: 10.5, confidence: 0.97 },
        { text: 'by', start_time: 10.5, end_time: 10.6, confidence: 0.99 },
        { text: 'Thursday.', start_time: 10.6, end_time: 11.0, confidence: 0.99 },
      ],
    },
  ],
  language: 'en',
};

/**
 * Spanish transcript fixture (multi-language test)
 */
export const RECALL_TRANSCRIPT_ES = {
  segments: [
    {
      speaker: 'Speaker 1',
      speaker_id: 1,
      language: 'es',
      words: [
        { text: 'Buenos', start_time: 0, end_time: 0.3, confidence: 0.98 },
        { text: 'días', start_time: 0.3, end_time: 0.6, confidence: 0.99 },
        { text: 'a', start_time: 0.6, end_time: 0.7, confidence: 0.99 },
        { text: 'todos.', start_time: 0.7, end_time: 1.0, confidence: 0.98 },
        { text: 'Hablemos', start_time: 1.1, end_time: 1.5, confidence: 0.97 },
        { text: 'del', start_time: 1.5, end_time: 1.6, confidence: 0.99 },
        { text: 'lanzamiento', start_time: 1.6, end_time: 2.1, confidence: 0.96 },
        { text: 'de', start_time: 2.1, end_time: 2.2, confidence: 0.99 },
        { text: 'Lumen', start_time: 2.2, end_time: 2.5, confidence: 0.97 },
        { text: '&', start_time: 2.5, end_time: 2.6, confidence: 0.99 },
        { text: 'Vale', start_time: 2.6, end_time: 2.8, confidence: 0.98 },
        { text: 'Beauty.', start_time: 2.8, end_time: 3.2, confidence: 0.99 },
      ],
    },
    {
      speaker: 'Speaker 2',
      speaker_id: 2,
      language: 'es',
      words: [
        { text: 'El', start_time: 3.5, end_time: 3.6, confidence: 0.99 },
        { text: 'producto', start_time: 3.6, end_time: 4.0, confidence: 0.98 },
        { text: 'SKU-LV-1001', start_time: 4.0, end_time: 4.6, confidence: 0.95 },
        { text: 'está', start_time: 4.6, end_time: 4.8, confidence: 0.98 },
        { text: 'listo.', start_time: 4.8, end_time: 5.2, confidence: 0.99 },
      ],
    },
  ],
  language: 'es',
};

/**
 * Webhook payload fixtures
 */
export const WEBHOOK_STATUS_CHANGE_JOINING = {
  event: 'bot.status_change',
  data: {
    bot: {
      id: SYNTHETIC_BOT_ID,
      status_changes: [{ code: 'joining_call', created_at: '2026-11-10T14:00:00Z' }],
      metadata: {
        internal_meeting_id: SYNTHETIC_MEETING_ID,
        tenant_id: SYNTHETIC_TENANT_ID,
      },
    },
  },
};

export const WEBHOOK_STATUS_CHANGE_RECORDING = {
  event: 'bot.status_change',
  data: {
    bot: {
      id: SYNTHETIC_BOT_ID,
      status_changes: [
        { code: 'joining_call', created_at: '2026-11-10T14:00:00Z' },
        { code: 'in_call_recording', created_at: '2026-11-10T14:00:30Z' },
      ],
      metadata: {
        internal_meeting_id: SYNTHETIC_MEETING_ID,
        tenant_id: SYNTHETIC_TENANT_ID,
      },
    },
  },
};

export const WEBHOOK_CALL_ENDED = {
  event: 'bot.done',
  data: {
    bot: {
      id: SYNTHETIC_BOT_ID,
      status_changes: [
        { code: 'joining_call', created_at: '2026-11-10T14:00:00Z' },
        { code: 'in_call_recording', created_at: '2026-11-10T14:00:30Z' },
        { code: 'done', created_at: '2026-11-10T15:00:00Z' },
      ],
      metadata: {
        internal_meeting_id: SYNTHETIC_MEETING_ID,
        tenant_id: SYNTHETIC_TENANT_ID,
      },
    },
  },
};

export const WEBHOOK_CONSENT_DENIED = {
  event: 'bot.recording_permission_denied',
  data: {
    bot: {
      id: SYNTHETIC_BOT_ID,
      status_changes: [
        { code: 'joining_call', created_at: '2026-11-10T14:00:00Z' },
        { code: 'recording_permission_denied', created_at: '2026-11-10T14:00:30Z' },
      ],
      metadata: {
        internal_meeting_id: SYNTHETIC_MEETING_ID,
        tenant_id: SYNTHETIC_TENANT_ID,
      },
    },
    sub_code: 'host_denied',
  },
};

/**
 * Mock Claude analysis response
 */
export const MOCK_ANALYSIS_RESPONSE = {
  summary: 'The team discussed the Q4 product launch for Lumen & Vale Beauty. SKU-LV-1001 is ready for PO-0001. Sarah will send the pricing proposal by Thursday.',
  key_decisions: [
    {
      decision: 'Finalize pricing by Friday',
      owner: 'Team',
      context: 'Required for PO-0001 processing',
    },
  ],
  action_items: [
    {
      task: 'Send pricing proposal',
      owner: 'Sarah',
      due_date: 'Thursday',
      priority: 'high' as const,
      context: 'For Q4 product launch',
    },
  ],
  topics_discussed: [
    {
      topic: 'Q4 Product Launch',
      summary: 'Discussion about Lumen & Vale Beauty product launch timeline',
      sentiment: 'positive' as const,
      time_spent_pct: 60,
    },
    {
      topic: 'Pricing',
      summary: 'Need to finalize pricing for SKU-LV-1001',
      sentiment: 'neutral' as const,
      time_spent_pct: 40,
    },
  ],
  questions_unresolved: [],
  risks_and_blockers: [],
  meeting_metrics: {
    overall_sentiment: 'positive' as const,
    meeting_effectiveness: 'high' as const,
    engagement_score: 85,
    dominant_speaker: 'Speaker 1',
  },
  next_meeting_suggestions: {
    recommended_agenda: ['Review pricing proposal', 'Finalize PO-0001'],
  },
};

/**
 * Mock Spanish analysis response
 */
export const MOCK_ANALYSIS_RESPONSE_ES = {
  summary: 'El equipo discutió el lanzamiento de producto para Lumen & Vale Beauty. El producto SKU-LV-1001 está listo.',
  key_decisions: [
    {
      decision: 'Proceder con el lanzamiento',
      owner: 'Equipo',
      context: 'Producto listo para producción',
    },
  ],
  action_items: [],
  topics_discussed: [
    {
      topic: 'Lanzamiento de Producto',
      summary: 'Discusión sobre el estado del lanzamiento',
      sentiment: 'positive' as const,
      time_spent_pct: 100,
    },
  ],
  questions_unresolved: [],
  risks_and_blockers: [],
  meeting_metrics: {
    overall_sentiment: 'positive' as const,
    meeting_effectiveness: 'high' as const,
    engagement_score: 80,
    dominant_speaker: 'Speaker 1',
  },
  next_meeting_suggestions: {
    recommended_agenda: ['Revisar estado del lanzamiento'],
  },
};
