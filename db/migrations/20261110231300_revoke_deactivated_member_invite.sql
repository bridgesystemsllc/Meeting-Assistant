-- Migration: 20261110231300_revoke_deactivated_member_invite
-- Description: Revoke a stale invite when accept is refused as
-- MEMBER_DEACTIVATED so a legacy pending row does not keep holding a seat.
-- Sorts after 20261110231200 and before P2-4 20261110240000.

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
  v_owners integer;
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
      UPDATE invites
         SET revoked_at = clock_timestamp()
       WHERE id = inv.id
         AND accepted_at IS NULL
         AND revoked_at IS NULL;
      RETURN jsonb_build_object('ok', false, 'code', 'MEMBER_DEACTIVATED');
    END IF;

    IF existing.seat_status = 'active' THEN
      IF existing.role = 'owner' AND inv.role IS DISTINCT FROM 'owner' THEN
        SELECT COUNT(*)::integer
          INTO v_owners
          FROM memberships
         WHERE tenant_id = inv.tenant_id
           AND role = 'owner'
           AND seat_status = 'active';
        IF v_owners <= 1 THEN
          UPDATE invites
             SET revoked_at = clock_timestamp()
           WHERE id = inv.id
             AND accepted_at IS NULL
             AND revoked_at IS NULL;
          RETURN jsonb_build_object('ok', false, 'code', 'LAST_OWNER');
        END IF;
      END IF;
      UPDATE invites
         SET revoked_at = clock_timestamp()
       WHERE id = inv.id
         AND accepted_at IS NULL
         AND revoked_at IS NULL;
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER');
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
