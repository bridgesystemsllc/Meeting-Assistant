-- Migration: 20261110220100_rls_policies
-- Description: ENABLE + FORCE RLS on tenant tables (policy keyed on
-- app.tenant_id) and on global tables (deny-by-default for the app role).
-- Narrow SECURITY DEFINER lookups for webhooks / jobs. Pinned search_path.
--
-- FORCE RLS applies to the table owner. SECURITY DEFINER functions in this
-- file are owned by the migrator, who must be superuser or BYPASSRLS so
-- session/webhook lookups still work with no request tenant set.

-- =============================================
-- TENANT TABLES: ENABLE + FORCE + isolation policy
-- =============================================

DO $$
DECLARE
  t text;
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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_isolation ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- =============================================
-- GLOBAL TABLES: ENABLE + FORCE, no policies (deny)
-- App role already has REVOKE ALL from P2-1.
-- =============================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants',
    'users',
    'webhook_events',
    'sessions',
    'oidc_login_state'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- =============================================
-- SECURITY DEFINER: webhook / meeting tenant lookup
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
  m meetings%ROWTYPE;
BEGIN
  IF p_claimed_meeting_id IS NOT NULL THEN
    SELECT * INTO m FROM meetings WHERE id = p_claimed_meeting_id;
  END IF;

  IF m.id IS NULL AND p_recall_bot_id IS NOT NULL AND btrim(p_recall_bot_id) <> '' THEN
    SELECT * INTO m FROM meetings WHERE recall_bot_id = p_recall_bot_id;
  END IF;

  IF m.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF p_claimed_tenant_id IS NOT NULL AND m.tenant_id IS DISTINCT FROM p_claimed_tenant_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TENANT_MISMATCH',
      'tenant_id', m.tenant_id,
      'meeting_id', m.id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', m.tenant_id,
    'meeting_id', m.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION webhook_insert_event(
  p_recall_bot_id text,
  p_event_type text,
  p_event_id text,
  p_payload jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n int;
BEGIN
  INSERT INTO webhook_events (recall_bot_id, event_type, event_id, payload)
  VALUES (p_recall_bot_id, p_event_type, p_event_id, p_payload)
  ON CONFLICT (recall_bot_id, event_type, event_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION webhook_event_exists(
  p_recall_bot_id text,
  p_event_type text,
  p_event_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM webhook_events
    WHERE recall_bot_id = p_recall_bot_id
      AND event_type = p_event_type
      AND event_id = p_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION webhook_mark_processed(
  p_recall_bot_id text,
  p_event_type text,
  p_event_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE webhook_events
     SET processed_at = clock_timestamp()
   WHERE recall_bot_id = p_recall_bot_id
     AND event_type = p_event_type
     AND event_id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_user_contact(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  u users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name);
END;
$$;

REVOKE ALL ON FUNCTION resolve_meeting_tenant(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webhook_insert_event(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION webhook_event_exists(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webhook_mark_processed(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_contact(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION resolve_meeting_tenant(text, uuid, uuid) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION webhook_insert_event(text, text, text, jsonb) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION webhook_event_exists(text, text, text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION webhook_mark_processed(text, text, text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION lookup_user_contact(uuid) TO meeting_assistant_app;
