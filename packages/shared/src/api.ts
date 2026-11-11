/**
 * API request/response schemas
 */

import { z } from 'zod';
import { MeetingAnalysisSchema } from './analysis.js';

/**
 * Health check response
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  service: z.string(),
  checks: z.object({
    database: z.enum(['ok', 'error']),
    redis: z.enum(['ok', 'error']),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * Join meeting request
 */
export const JoinMeetingRequestSchema = z.object({
  meetingUrl: z.string().url(),
  title: z.string().optional(),
});

export type JoinMeetingRequest = z.infer<typeof JoinMeetingRequestSchema>;

/**
 * Join meeting response
 */
export const JoinMeetingResponseSchema = z.object({
  success: z.boolean(),
  meetingId: z.string().uuid(),
  botId: z.string(),
  message: z.string(),
});

export type JoinMeetingResponse = z.infer<typeof JoinMeetingResponseSchema>;

/**
 * Speaker info
 */
export const SpeakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  word_count: z.number(),
  duration_ms: z.number(),
  talk_time_pct: z.number(),
});

export type Speaker = z.infer<typeof SpeakerSchema>;

/**
 * Transcript response
 */
export const TranscriptResponseSchema = z.object({
  fullText: z.string(),
  speakers: z.array(SpeakerSchema),
  wordCount: z.number(),
  language: z.string().nullable(),
});

export type TranscriptResponse = z.infer<typeof TranscriptResponseSchema>;

/**
 * Meeting list item
 */
export const MeetingListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  platform: z.string(),
  status: z.string(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  duration_seconds: z.number().nullable(),
  summary: z.string().nullable(),
  meeting_sentiment: z.string().nullable(),
  engagement_score: z.number().nullable(),
  action_item_count: z.number(),
  language: z.string().nullable(),
});

export type MeetingListItem = z.infer<typeof MeetingListItemSchema>;

/**
 * Meeting detail response
 */
export const MeetingDetailResponseSchema = z.object({
  meeting: z.object({
    id: z.string().uuid(),
    title: z.string(),
    platform: z.string(),
    meeting_url: z.string(),
    status: z.string(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    duration_seconds: z.number().nullable(),
    recall_bot_id: z.string().nullable(),
  }),
  transcript: TranscriptResponseSchema.nullable(),
  analysis: MeetingAnalysisSchema.nullable(),
});

export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponseSchema>;

/**
 * API error response
 */
export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Pagination params
 */
export const PaginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type Pagination = z.infer<typeof PaginationSchema>;
