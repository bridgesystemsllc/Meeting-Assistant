-- Migration: 20261110230600_lookup_user_contact_tenant
-- lookup_user_contact is SECURITY DEFINER and must not return another
-- tenant's email. It reads app.tenant_id from the session: no tenant or a
-- membership mismatch returns NULL (empty), never an email.

CREATE OR REPLACE FUNCTION lookup_user_contact(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  session_tenant uuid;
  found_email text;
  found_name text;
BEGIN
  BEGIN
    session_tenant := nullif(btrim(current_setting('app.tenant_id', true)), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  IF session_tenant IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email, u.name
    INTO found_email, found_name
    FROM users u
    JOIN memberships mem
      ON mem.user_id = u.id
     AND mem.tenant_id = session_tenant
   WHERE u.id = p_user_id
   LIMIT 1;

  IF found_email IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('email', found_email, 'name', found_name);
END;
$$;
