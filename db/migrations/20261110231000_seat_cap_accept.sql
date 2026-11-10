-- Migration: 20261110231000_seat_cap_accept
-- Description: Lock tenants on invite accept, refuse over-cap and deactivated
-- reactivation, tenant-scope directory lookups. Does not rewrite 20261110223000.

-- Directory lookups must not return users/sessions from other tenants.
CREATE OR REPLACE FUNCTION lookup_users_contact(p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ctx uuid;
  result jsonb;
BEGIN
  v_ctx := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF v_ctx IS NULL THEN
    RAISE EXCEPTION 'tenant required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name)),
    '[]'::jsonb
  )
  INTO result
  FROM users u
  WHERE u.id = ANY(p_user_ids)
    AND EXISTS (
      SELECT 1
      FROM memberships m
      WHERE m.user_id = u.id
        AND m.tenant_id = v_ctx
    );

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
  v_ctx uuid;
  result jsonb;
BEGIN
  v_ctx := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF v_ctx IS NULL THEN
    RAISE EXCEPTION 'tenant required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_object_agg(s.user_id::text, s.last_seen), '{}'::jsonb)
  INTO result
  FROM (
    SELECT sess.user_id, MAX(sess.last_seen_at) AS last_seen
    FROM sessions sess
    WHERE sess.user_id = ANY(p_user_ids)
      AND sess.active_tenant_id = v_ctx
      AND EXISTS (
        SELECT 1
        FROM memberships m
        WHERE m.user_id = sess.user_id
          AND m.tenant_id = v_ctx
      )
    GROUP BY sess.user_id
  ) s;

  RETURN result;
END;
$$;

-- Accept must lock the tenant, count occupied seats, apply the invite role,
-- and never reactivate a deactivated member. Verified-email matching stays
-- with the caller (P2-1 auth_resolve_identity); this function still checks
-- the invite email.
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
  existing memberships%ROWTYPE;
  v_limit integer;
  v_occupied integer;
BEGIN
  SELECT * INTO inv
  FROM invites
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INVITE');
  END IF;

  SELECT seat_limit INTO v_limit
  FROM tenants
  WHERE id = inv.tenant_id
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

  SELECT * INTO existing
  FROM memberships
  WHERE tenant_id = inv.tenant_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing.seat_status = 'deactivated' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'MEMBER_DEACTIVATED');
    END IF;

    UPDATE memberships
       SET seat_status = 'active',
           role = inv.role
     WHERE id = existing.id
     RETURNING * INTO mem;
  ELSE
    SELECT COUNT(*)::integer
      INTO v_occupied
      FROM memberships
     WHERE tenant_id = inv.tenant_id
       AND seat_status IN ('invited', 'active');

    IF v_occupied >= v_limit THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SEAT_LIMIT_REACHED');
    END IF;

    INSERT INTO memberships (tenant_id, user_id, role, seat_status)
    VALUES (inv.tenant_id, p_user_id, inv.role, 'active')
    RETURNING * INTO mem;
  END IF;

  UPDATE invites SET accepted_at = clock_timestamp() WHERE id = inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', mem.id,
    'tenant_id', mem.tenant_id,
    'role', mem.role
  );
END;
$$;
