-- Migration: 20261110255000_processing_dlq_force_rls
-- Description: processing_dlq FORCEs RLS and uses the canonical
-- tenant_isolation policy (TO meeting_assistant_app, USING + WITH CHECK on
-- NULLIF(app.tenant_id)). Replaces processing_dlq_tenant_policy from
-- 20261110230000_rename_transcript_retention, which already ran on main and
-- is left unchanged so upgraded databases pick this up. Idempotent. Sorts
-- after 20261110254000.

ALTER TABLE processing_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_dlq FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS processing_dlq_tenant_policy ON processing_dlq;
DROP POLICY IF EXISTS tenant_isolation ON processing_dlq;
CREATE POLICY tenant_isolation ON processing_dlq TO meeting_assistant_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON processing_dlq TO meeting_assistant_app;
