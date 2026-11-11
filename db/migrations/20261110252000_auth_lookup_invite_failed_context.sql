-- Migration: 20261110252000_auth_lookup_invite_failed_context
-- Description: Return tenant/invite ids on used, revoked, and expired
-- lookups so failed-invite can be written without leaking them to the
-- client. Sorts after 20261110251000.

CREATE OR REPLACE FUNCTION auth_lookup_invite(p_token_hash text, p_expected_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inv invites%ROWTYPE;
  t tenants%ROWTYPE;
  failed jsonb;
BEGIN
  SELECT * INTO inv FROM invites WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INVITE');
  END IF;

  SELECT * INTO t FROM tenants WHERE id = inv.tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INVITE');
  END IF;

  IF p_expected_slug IS NOT NULL AND btrim(p_expected_slug) <> ''
     AND t.slug IS DISTINCT FROM btrim(p_expected_slug) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_WRONG_TENANT');
  END IF;

  failed := jsonb_build_object(
    'ok', false,
    'id', inv.id,
    'email', inv.email,
    'tenant', jsonb_build_object('id', t.id)
  );

  IF inv.accepted_at IS NOT NULL THEN
    RETURN failed || jsonb_build_object('code', 'INVITE_USED');
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RETURN failed || jsonb_build_object('code', 'INVITE_REVOKED');
  END IF;
  IF inv.expires_at <= clock_timestamp() THEN
    RETURN failed || jsonb_build_object('code', 'INVITE_EXPIRED');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', inv.id,
    'email', inv.email,
    'role', inv.role,
    'expires_at', inv.expires_at,
    'tenant', jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug)
  );
END;
$$;
