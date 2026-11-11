-- P2-5: Rename retention_days to transcript_retention_days
-- P3-1: Add processing_dlq table for failed jobs
-- P1-4: Add media_deleted_at column to meetings
-- Migration timestamp is AFTER 002 and 20261110223000 per instructions

-- Step 1: Rename the retention column
ALTER TABLE tenant_settings
  RENAME COLUMN retention_days TO transcript_retention_days;

-- Step 2: Allow NULL values (user may want to keep forever)
ALTER TABLE tenant_settings
  ALTER COLUMN transcript_retention_days DROP NOT NULL;

-- Step 3: Add comment for clarity
COMMENT ON COLUMN tenant_settings.transcript_retention_days IS 
  'Days to retain transcripts. NULL means keep forever. Default 365.';

-- P1-4: Add media_deleted_at column to meetings (for tracking Recall media deletion)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS media_deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN meetings.media_deleted_at IS 
  'When Recall media was deleted. NULL if not yet deleted. Must be non-NULL before status=completed.';

-- P3-1: Add processing_dlq table for dead-letter queue
CREATE TABLE IF NOT EXISTS processing_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT processing_dlq_meeting_unique UNIQUE (meeting_id)
);

-- Enable RLS on processing_dlq
ALTER TABLE processing_dlq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_dlq_tenant_policy ON processing_dlq;
DROP POLICY IF EXISTS tenant_isolation ON processing_dlq;
CREATE POLICY tenant_isolation ON processing_dlq TO meeting_assistant_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_dlq TO meeting_assistant_app;

COMMENT ON TABLE processing_dlq IS 
  'Dead letter queue for failed meeting processing jobs. P3-1.';
