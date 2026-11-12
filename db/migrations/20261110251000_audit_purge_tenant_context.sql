-- Migration: 20261110251000_audit_purge_tenant_context
-- Description: Purge functions set tenant context so FORCE RLS still
-- applies for a NOSUPERUSER NOBYPASSRLS table owner. User erasure also
-- clears email_hmac / email_masked. Sorts after 20261110250000.

CREATE OR REPLACE FUNCTION purge_audit_tenant(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.audit_purge', '1', true);
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  DELETE FROM audit_events WHERE tenant_id = p_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

DROP FUNCTION IF EXISTS purge_audit_user(uuid);

CREATE OR REPLACE FUNCTION purge_audit_user(p_user_id uuid, p_email_hmac text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer := 0;
  n_upd integer;
  t uuid;
  hmacs text[] := ARRAY[]::text[];
  extra text[];
BEGIN
  PERFORM set_config('app.audit_purge', '1', true);

  IF p_email_hmac IS NOT NULL AND btrim(p_email_hmac) <> '' THEN
    hmacs := ARRAY[p_email_hmac];
  END IF;

  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t::text, true);
    SELECT COALESCE(array_agg(DISTINCT email_hmac), ARRAY[]::text[])
      INTO extra
      FROM audit_events
     WHERE email_hmac IS NOT NULL
       AND (
         actor_user_id = p_user_id
         OR (target_type = 'user' AND target_id = p_user_id)
       );
    hmacs := hmacs || extra;
  END LOOP;

  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t::text, true);

    UPDATE audit_events
       SET actor_user_id = CASE WHEN actor_user_id = p_user_id THEN NULL ELSE actor_user_id END,
           email_hmac = CASE
             WHEN actor_user_id = p_user_id
               OR (target_type = 'user' AND target_id = p_user_id)
               OR (email_hmac IS NOT NULL AND email_hmac = ANY(hmacs))
             THEN NULL ELSE email_hmac END,
           email_masked = CASE
             WHEN actor_user_id = p_user_id
               OR (target_type = 'user' AND target_id = p_user_id)
               OR (email_hmac IS NOT NULL AND email_hmac = ANY(hmacs))
             THEN NULL ELSE email_masked END
     WHERE actor_user_id = p_user_id
        OR (target_type = 'user' AND target_id = p_user_id)
        OR (email_hmac IS NOT NULL AND email_hmac = ANY(hmacs));
    GET DIAGNOSTICS n_upd = ROW_COUNT;
    n := n + n_upd;

    DELETE FROM audit_events
     WHERE target_type = 'user'
       AND target_id = p_user_id;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION purge_audit_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_audit_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_audit_tenant(uuid) FROM meeting_assistant_app;
REVOKE ALL ON FUNCTION purge_audit_user(uuid, text) FROM meeting_assistant_app;
