-- Migration: 20261110254000_tenants_purge_audit_on_delete
-- Description: BEFORE DELETE on tenants calls purge_audit_tenant (purge
-- over refuse). purge_audit_user walks DISTINCT tenant_id FROM
-- audit_events so orphan tenant_ids are still erased. Sorts after
-- 20261110253000.

-- Owner-only read of every audit tenant_id while app.audit_purge is set.
-- App role is not a member of this policy (boot guard stays tenant-only).
DO $$
DECLARE
  owner_name name := current_user;
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS audit_purge_owner ON audit_events');
  EXECUTE format(
    'CREATE POLICY audit_purge_owner ON audit_events TO %I
       USING (current_setting(''app.audit_purge'', true) = ''1'')
       WITH CHECK (current_setting(''app.audit_purge'', true) = ''1'')',
    owner_name
  );
END $$;

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

  FOR t IN SELECT DISTINCT tenant_id FROM audit_events LOOP
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

  FOR t IN SELECT DISTINCT tenant_id FROM audit_events LOOP
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

CREATE OR REPLACE FUNCTION tenants_purge_audit_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM purge_audit_tenant(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tenants_purge_audit_before_delete ON tenants;
CREATE TRIGGER tenants_purge_audit_before_delete
  BEFORE DELETE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION tenants_purge_audit_before_delete();

REVOKE ALL ON FUNCTION purge_audit_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_audit_user(uuid, text) FROM meeting_assistant_app;
REVOKE ALL ON FUNCTION tenants_purge_audit_before_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenants_purge_audit_before_delete() FROM meeting_assistant_app;
