-- Migration: 20261110230000_composite_fks_rls_definer
-- Description: Composite (tenant_id, meeting_id) FKs; unique (tenant_id, id)
-- on meetings; scope tenant_isolation to the app role; owner/definer policy
-- so SECURITY DEFINER lookups work when the migrator is not BYPASSRLS.
-- Global tables keep ENABLE+FORCE; 004 auth_definer policies cover the owner.
-- Minimize definer return columns.

-- =============================================
-- Composite FKs (FK checks bypass RLS; tenant must match parent)
-- =============================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid IN ('transcripts'::regclass, 'meeting_analysis'::regclass, 'email_deliveries'::regclass)
      AND c.confrelid = 'meetings'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_tenant_id_id_key;
ALTER TABLE meetings ADD CONSTRAINT meetings_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE transcripts
  ADD CONSTRAINT transcripts_tenant_meeting_fkey
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES meetings (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE meeting_analysis
  ADD CONSTRAINT meeting_analysis_tenant_meeting_fkey
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES meetings (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE email_deliveries
  ADD CONSTRAINT email_deliveries_tenant_meeting_fkey
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES meetings (tenant_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_tenant_meeting ON transcripts (tenant_id, meeting_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_tenant_meeting ON meeting_analysis (tenant_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_tenant_meeting ON email_deliveries (tenant_id, meeting_id);

-- =============================================
-- Tenant policies: app role isolation + owner/definer access
-- =============================================

DO $$
DECLARE
  t text;
  owner_name text := current_user;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'meetings',
    'transcripts',
    'meeting_analysis',
    'email_deliveries',
    'tenant_settings',
    'memberships',
    'invites'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO meeting_assistant_app
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS definer_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY definer_access ON %I TO %I USING (true) WITH CHECK (true)',
      t,
      owner_name
    );
  END LOOP;
END $$;

-- Global tables keep ENABLE + FORCE from 003/20100. 004's auth_definer
-- policies (TO the migration owner) are what makes FORCE compatible with a
-- NOSUPERUSER NOBYPASSRLS owner. Do not drop FORCE here. App role stays REVOKEd.

-- =============================================
-- Narrower SECURITY DEFINER return shapes
-- =============================================

CREATE OR REPLACE FUNCTION resolve_meeting_tenant(
  p_recall_bot_id text,
  p_claimed_tenant_id uuid,
  p_claimed_meeting_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  found_id uuid;
  found_tenant uuid;
BEGIN
  IF p_claimed_meeting_id IS NOT NULL THEN
    SELECT m.id, m.tenant_id INTO found_id, found_tenant
    FROM meetings m
    WHERE m.id = p_claimed_meeting_id;
  END IF;

  IF found_id IS NULL AND p_recall_bot_id IS NOT NULL AND btrim(p_recall_bot_id) <> '' THEN
    SELECT m.id, m.tenant_id INTO found_id, found_tenant
    FROM meetings m
    WHERE m.recall_bot_id = p_recall_bot_id;
  END IF;

  IF found_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF p_claimed_tenant_id IS NOT NULL AND found_tenant IS DISTINCT FROM p_claimed_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TENANT_MISMATCH');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', found_tenant,
    'meeting_id', found_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION lookup_user_contact(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  found_email text;
  found_name text;
BEGIN
  SELECT u.email, u.name INTO found_email, found_name
  FROM users u
  WHERE u.id = p_user_id;

  IF found_email IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('email', found_email, 'name', found_name);
END;
$$;
