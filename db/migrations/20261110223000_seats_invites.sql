-- Migration: 20261110223000_seats_invites
-- Description: Invite revoke column, seat-limit lock, directory lookups.
-- App role still cannot SELECT tenants/users/sessions directly (P2-2).

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- =============================================
-- Seat snapshot: lock tenants row, count active/invited memberships
-- plus pending invites that are not already represented by a membership.
-- Must run inside withTenant (app.tenant_id must match p_tenant_id).
-- =============================================

CREATE OR REPLACE FUNCTION tenant_seat_snapshot(p_tenant_id uuid, p_for_update boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ctx uuid;
  v_limit integer;
  v_used integer;
BEGIN
  v_ctx := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF v_ctx IS NULL OR v_ctx IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_for_update THEN
    SELECT seat_limit INTO v_limit FROM tenants WHERE id = p_tenant_id FOR UPDATE;
  ELSE
    SELECT seat_limit INTO v_limit FROM tenants WHERE id = p_tenant_id;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    (
      SELECT COUNT(*)::integer
      FROM memberships
      WHERE tenant_id = p_tenant_id
        AND seat_status IN ('invited', 'active')
    )
    +
    (
      SELECT COUNT(*)::integer
      FROM invites i
      WHERE i.tenant_id = p_tenant_id
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > clock_timestamp()
        AND NOT EXISTS (
          SELECT 1
          FROM memberships m
          JOIN users u ON u.id = m.user_id
          WHERE m.tenant_id = i.tenant_id
            AND lower(u.email) = lower(i.email)
            AND m.seat_status IN ('invited', 'active')
        )
    )
  INTO v_used;

  RETURN jsonb_build_object('seat_limit', v_limit, 'seats_used', v_used);
END;
$$;

CREATE OR REPLACE FUNCTION lookup_users_contact(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name)),
    '[]'::jsonb
  )
  INTO result
  FROM users u
  WHERE u.id = ANY(p_user_ids);

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION auth_last_seen_by_user_ids(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(s.user_id::text, s.last_seen), '{}'::jsonb)
  INTO result
  FROM (
    SELECT user_id, MAX(last_seen_at) AS last_seen
    FROM sessions
    WHERE user_id = ANY(p_user_ids)
    GROUP BY user_id
  ) s;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION auth_revoke_sessions_for_user(p_user_id uuid, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM sessions
  WHERE user_id = p_user_id
    AND (active_tenant_id = p_tenant_id OR active_tenant_id IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION auth_lookup_invite(p_token_hash text, p_expected_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inv invites%ROWTYPE;
  t tenants%ROWTYPE;
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

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_USED');
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_REVOKED');
  END IF;
  IF inv.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_EXPIRED');
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

-- Replace accept-invite so used / expired / revoked / wrong-email fail cleanly.
CREATE OR REPLACE FUNCTION auth_accept_invite(
  p_token_hash text,
  p_user_id uuid,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inv invites%ROWTYPE;
  mem memberships%ROWTYPE;
BEGIN
  SELECT * INTO inv
  FROM invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INVITE');
  END IF;

  IF inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_USED');
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_REVOKED');
  END IF;
  IF inv.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_EXPIRED');
  END IF;

  IF lower(inv.email) <> lower(btrim(p_email)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVITE_EMAIL_MISMATCH');
  END IF;

  INSERT INTO memberships (tenant_id, user_id, role, seat_status)
  VALUES (inv.tenant_id, p_user_id, inv.role, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET seat_status = 'active',
        role = CASE
          WHEN memberships.seat_status = 'deactivated' THEN memberships.role
          ELSE EXCLUDED.role
        END
  RETURNING * INTO mem;

  UPDATE invites SET accepted_at = clock_timestamp() WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', mem.id,
    'tenant_id', mem.tenant_id,
    'role', mem.role
  );
END;
$$;

REVOKE ALL ON FUNCTION tenant_seat_snapshot(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_users_contact(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_last_seen_by_user_ids(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_revoke_sessions_for_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_lookup_invite(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_accept_invite(text, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION tenant_seat_snapshot(uuid, boolean) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION lookup_users_contact(uuid[]) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_last_seen_by_user_ids(uuid[]) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_revoke_sessions_for_user(uuid, uuid) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_lookup_invite(text, text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_accept_invite(text, uuid, text) TO meeting_assistant_app;
