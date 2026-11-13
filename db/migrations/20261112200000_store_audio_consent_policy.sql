-- Migration: 20261112200000_store_audio_consent_policy
-- Description: Add tenant_settings.store_audio (fixed false), consent_policy
-- (all_party_notice only in v1), and notify_attendees (default true). Also
-- adds a tenant-scoped SECURITY DEFINER lookup for the tenant name, used
-- by the in-call consent announcement. Columns land on existing
-- tenant_settings (already FORCE RLS + tenant_isolation). Idempotent.
-- Sorts after 20261110256000_consent. Up-only SQL.

-- =============================================
-- TENANT SETTINGS: transcript-only + consent policy
-- =============================================

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS store_audio BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_policy TEXT NOT NULL DEFAULT 'all_party_notice',
  ADD COLUMN IF NOT EXISTS notify_attendees BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_settings_store_audio_false'
      AND conrelid = 'public.tenant_settings'::regclass
  ) THEN
    ALTER TABLE tenant_settings
      ADD CONSTRAINT tenant_settings_store_audio_false
      CHECK (store_audio = false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_settings_consent_policy_v1'
      AND conrelid = 'public.tenant_settings'::regclass
  ) THEN
    ALTER TABLE tenant_settings
      ADD CONSTRAINT tenant_settings_consent_policy_v1
      CHECK (consent_policy = 'all_party_notice');
  END IF;
END $$;

COMMENT ON COLUMN tenant_settings.store_audio IS
  'Transcript-only in v1; CHECK forces false and the API cannot edit this column';
COMMENT ON COLUMN tenant_settings.consent_policy IS
  'v1 supports only all_party_notice; every meeting is treated as all-party consent';
COMMENT ON COLUMN tenant_settings.notify_attendees IS
  'When true (default), POST /meetings sends or queues the pre-join consent notice';

-- =============================================
-- Tenant-scoped name lookup (global tenants table)
-- =============================================

CREATE OR REPLACE FUNCTION lookup_tenant_name(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  session_tenant uuid;
  found_name text;
BEGIN
  BEGIN
    session_tenant := nullif(btrim(current_setting('app.tenant_id', true)), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  IF session_tenant IS NULL OR p_tenant_id IS NULL
     OR p_tenant_id IS DISTINCT FROM session_tenant THEN
    RETURN NULL;
  END IF;

  SELECT t.name
    INTO found_name
    FROM tenants t
   WHERE t.id = session_tenant;

  RETURN found_name;
END;
$$;

REVOKE ALL ON FUNCTION lookup_tenant_name(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_tenant_name(uuid) FROM meeting_assistant_app;
GRANT EXECUTE ON FUNCTION lookup_tenant_name(uuid) TO meeting_assistant_app;
