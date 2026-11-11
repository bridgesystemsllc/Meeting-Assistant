/**
 * Database entity types
 * These map to the SQL schema in db/migrations
 */

import { z } from 'zod';

/**
 * Tenant entity (global table)
 */
export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

/**
 * Tenant settings entity (tenant_id PK/FK)
 */
export const TenantSettingsSchema = z.object({
  tenant_id: z.string().uuid(),
  retention_days: z.number().default(365),
  created_at: z.date(),
  updated_at: z.date(),
});

export type TenantSettings = z.infer<typeof TenantSettingsSchema>;

/**
 * User entity (global table - memberships come later)
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Session entity (global table)
 */
export const SessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  token_hash: z.string(),
  expires_at: z.date(),
  created_at: z.date(),
});

export type Session = z.infer<typeof SessionSchema>;

/**
 * OIDC login state entity (global table)
 */
export const OidcLoginStateSchema = z.object({
  id: z.string().uuid(),
  state: z.string(),
  nonce: z.string(),
  redirect_uri: z.string().nullable(),
  expires_at: z.date(),
  created_at: z.date(),
});

export type OidcLoginState = z.infer<typeof OidcLoginStateSchema>;

/**
 * Meeting entity
 */
export const MeetingSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  platform: z.string(),
  meeting_url: z.string(),
  scheduled_at: z.date().nullable(),
  started_at: z.date().nullable(),
  ended_at: z.date().nullable(),
  duration_seconds: z.number().nullable(),
  recall_bot_id: z.string().nullable(),
  status: z.string(),
  language: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Meeting = z.infer<typeof MeetingSchema>;

/**
 * Transcript entity
 */
export const TranscriptSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  raw_transcript: z.unknown(),
  full_text: z.string(),
  speakers: z.unknown(),
  word_count: z.number(),
  language: z.string().nullable(),
  created_at: z.date(),
});

export type Transcript = z.infer<typeof TranscriptSchema>;

/**
 * Meeting analysis entity
 */
export const MeetingAnalysisEntitySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  summary: z.string(),
  key_decisions: z.unknown(),
  action_items: z.unknown(),
  topics: z.unknown(),
  meeting_sentiment: z.string().nullable(),
  engagement_score: z.number().nullable(),
  talk_time: z.unknown(),
  questions_raised: z.unknown(),
  risks_identified: z.unknown(),
  next_meeting_agenda: z.unknown(),
  raw_ai_response: z.string().nullable(),
  model_used: z.string().nullable(),
  created_at: z.date(),
});

export type MeetingAnalysisEntity = z.infer<typeof MeetingAnalysisEntitySchema>;

/**
 * Webhook event entity for idempotency (global table)
 */
export const WebhookEventSchema = z.object({
  id: z.string().uuid(),
  recall_bot_id: z.string(),
  event_type: z.string(),
  event_id: z.string(),
  payload: z.unknown(),
  processed_at: z.date().nullable(),
  created_at: z.date(),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

/**
 * Email delivery log entity
 */
export const EmailDeliverySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  recipient_email: z.string(),
  sent_at: z.date().nullable(),
  status: z.string(),
  created_at: z.date(),
});

export type EmailDelivery = z.infer<typeof EmailDeliverySchema>;
