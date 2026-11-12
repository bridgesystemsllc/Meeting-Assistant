-- Migration: 20261110256000_consent
-- Description: Consent flow columns and consent_events. The table FORCEs RLS
-- and uses the canonical tenant_isolation policy (TO meeting_assistant_app,
-- USING + WITH CHECK on NULLIF(app.tenant_id)). Composite FK to
-- meetings(tenant_id, id) matches sibling tenant tables. Idempotent. Sorts
-- after 20261110255000. Up-only SQL, matching the rest of db/migrations
-- (no down files).

-- =============================================
-- TENANT SETTINGS ADDITIONS (nullable columns only)
-- =============================================

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS bot_display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pre_join_notice TEXT,
  ADD COLUMN IF NOT EXISTS in_call_notice TEXT,
  ADD COLUMN IF NOT EXISTS stop_keywords TEXT[] DEFAULT ARRAY['stop recording', 'stop transcription', 'leave meeting'];

COMMENT ON COLUMN tenant_settings.bot_display_name IS
  'Configurable bot name shown in meeting (default: Meeting Notetaker (recording transcript))';
COMMENT ON COLUMN tenant_settings.pre_join_notice IS
  'Notice shown in the product UI before scheduling and posted to chat before transcription starts';
COMMENT ON COLUMN tenant_settings.in_call_notice IS
  'Periodic or on-join chat message during the meeting';
COMMENT ON COLUMN tenant_settings.stop_keywords IS
  'Keywords that trigger auto-leave when typed by any participant';

-- =============================================
-- CONSENT EVENTS TABLE (tenant-scoped)
-- =============================================

CREATE TABLE IF NOT EXISTS consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_source VARCHAR(100),
  actor_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT consent_events_valid_event_type CHECK (event_type IN (
    'consent_granted',
    'consent_denied_by_host',
    'consent_denied_by_keyword',
    'bot_removed_by_host',
    'recording_permission_denied'
  ))
);

-- Prefer the composite child FK used by other meeting-scoped tenant tables.
ALTER TABLE consent_events DROP CONSTRAINT IF EXISTS consent_events_meeting_id_fkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consent_events_tenant_meeting_fkey'
      AND conrelid = 'public.consent_events'::regclass
  ) THEN
    ALTER TABLE consent_events
      ADD CONSTRAINT consent_events_tenant_meeting_fkey
      FOREIGN KEY (tenant_id, meeting_id) REFERENCES meetings (tenant_id, id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_consent_events_tenant_id ON consent_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consent_events_meeting_id ON consent_events(meeting_id);
CREATE INDEX IF NOT EXISTS idx_consent_events_event_type ON consent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_consent_events_created_at ON consent_events(created_at DESC);

COMMENT ON TABLE consent_events IS
  'Audit log for consent events; records denials even when no transcript is stored';

-- =============================================
-- MEETINGS TABLE ADDITIONS (consent status tracking)
-- =============================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS consent_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS consent_denied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_denied_reason VARCHAR(255);

COMMENT ON COLUMN meetings.consent_status IS 'pending, granted, denied';
COMMENT ON COLUMN meetings.consent_denied_at IS
  'Timestamp when consent was denied (triggers cleanup)';
COMMENT ON COLUMN meetings.consent_denied_reason IS
  'Reason for denial: host_denied, keyword_detected, permission_denied';

CREATE INDEX IF NOT EXISTS idx_meetings_consent_status ON meetings(consent_status);

-- =============================================
-- RLS + app-role GRANT (canonical tenant_isolation)
-- =============================================

ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON consent_events;
CREATE POLICY tenant_isolation ON consent_events TO meeting_assistant_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON consent_events TO meeting_assistant_app;
