-- Migration: 20261110231100_accept_already_member_identity_upsert
-- Description: Refuse invite accept when the email already has an active
-- membership (no role change / owner demotion). Upsert users/identities so
-- concurrent first-login with the same email does not 500.
-- Sorts after 20261110231000 and before P2-4 20261110240000.

-- Accept: deactivated stays deactivated; active stays as-is (ALREADY_MEMBER);
-- invited may take the invite role. Never change an active owner via invite.
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
          RETURN jsonb_build_object('ok', false, 'code', 'LAST_OWNER');
        END IF;
      END IF;
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

CREATE OR REPLACE FUNCTION auth_resolve_identity(
  p_issuer text,
  p_subject text,
  p_provider text,
  p_email text,
  p_name text,
  p_email_verified boolean,
  p_invite_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ident user_identities%ROWTYPE;
  existing_ident user_identities%ROWTYPE;
  u users%ROWTYPE;
  invite_result jsonb;
  mems jsonb;
  normalized text := lower(btrim(p_email));
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL OR p_issuer = '' OR p_subject = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
  END IF;

  SELECT * INTO ident
    FROM user_identities
   WHERE issuer = p_issuer AND subject = p_subject;

  IF FOUND THEN
    SELECT * INTO u FROM users WHERE id = ident.user_id;
    IF p_name IS NOT NULL AND p_name <> '' THEN
      UPDATE users
         SET name = COALESCE(NULLIF(p_name, ''), name),
             updated_at = NOW()
       WHERE id = u.id
      RETURNING * INTO u;
    END IF;
  ELSE
    IF NOT COALESCE(p_email_verified, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_UNVERIFIED');
    END IF;

    IF normalized IS NULL OR normalized = '' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
    END IF;

    BEGIN
      INSERT INTO users (email, name)
      VALUES (normalized, NULLIF(p_name, ''))
      ON CONFLICT (email) DO UPDATE
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), users.name),
            updated_at = NOW()
      RETURNING * INTO u;

      SELECT * INTO existing_ident
        FROM user_identities
       WHERE user_id = u.id
       LIMIT 1;
      IF FOUND AND (existing_ident.issuer IS DISTINCT FROM p_issuer
                    OR existing_ident.subject IS DISTINCT FROM p_subject) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
      END IF;

      INSERT INTO user_identities (user_id, issuer, subject, provider, email)
      VALUES (u.id, p_issuer, p_subject, p_provider, normalized)
      ON CONFLICT (issuer, subject) DO NOTHING;

      SELECT * INTO ident
        FROM user_identities
       WHERE issuer = p_issuer AND subject = p_subject;
      IF NOT FOUND OR ident.user_id IS DISTINCT FROM u.id THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
      END IF;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO ident
        FROM user_identities
       WHERE issuer = p_issuer AND subject = p_subject;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
      END IF;
      SELECT * INTO u FROM users WHERE id = ident.user_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
      END IF;
    END;
  END IF;

  IF p_invite_token_hash IS NOT NULL THEN
    IF NOT COALESCE(p_email_verified, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EMAIL_UNVERIFIED');
    END IF;
    invite_result := auth_accept_invite(p_invite_token_hash, u.id, normalized);
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at')), '[]'::jsonb)
    INTO mems
    FROM (
      SELECT jsonb_build_object(
        'id', m.id,
        'role', m.role,
        'seat_status', m.seat_status,
        'created_at', m.created_at,
        'tenant', jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'slug', t.slug
        )
      ) AS item
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = u.id
    ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name),
    'memberships', mems,
    'invite', invite_result
  );
END;
$$;
