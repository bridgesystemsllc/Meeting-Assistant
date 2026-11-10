-- Migration: 003_20261110_user_identities
-- Identities are keyed on (issuer, subject), never email.
-- Global-table exemption (ATLAS Q4): no tenant_id — this is a user-level table
-- like users/sessions. App role is denied; lookups are SECURITY DEFINER only.
-- FORCE RLS so a later GRANT cannot be used by the table owner without a policy.
-- Seat-limit enforcement inside auth_accept_invite is owned by P2-3/#8.
-- Worker tenant binding is P2-2/#6. Auth audit events are decision 11 / later PR.

CREATE TABLE IF NOT EXISTS user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE user_identities FROM PUBLIC;
REVOKE ALL ON TABLE user_identities FROM meeting_assistant_app;

-- Idle refresh must not extend past the absolute TTL.
CREATE OR REPLACE FUNCTION auth_touch_session(p_token_hash text, p_idle_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE sessions
     SET last_seen_at = clock_timestamp(),
         idle_expires_at = LEAST(p_idle_expires_at, expires_at)
   WHERE token_hash = p_token_hash
     AND expires_at > clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION auth_purge_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  removed integer := 0;
  n integer;
BEGIN
  DELETE FROM sessions
   WHERE expires_at <= clock_timestamp()
      OR idle_expires_at <= clock_timestamp();
  GET DIAGNOSTICS n = ROW_COUNT;
  removed := removed + n;

  DELETE FROM oidc_login_state
   WHERE expires_at <= clock_timestamp();
  GET DIAGNOSTICS n = ROW_COUNT;
  removed := removed + n;

  RETURN removed;
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

    SELECT * INTO u FROM users WHERE email = normalized;

    IF FOUND THEN
      SELECT * INTO existing_ident
        FROM user_identities
       WHERE user_id = u.id
       LIMIT 1;
      IF FOUND THEN
        -- Never auto-link a new (iss, sub) onto an account that already has one.
        RETURN jsonb_build_object('ok', false, 'code', 'OIDC_FAILED');
      END IF;
      INSERT INTO user_identities (user_id, issuer, subject, provider, email)
      VALUES (u.id, p_issuer, p_subject, p_provider, normalized);
      UPDATE users
         SET name = COALESCE(NULLIF(p_name, ''), name),
             updated_at = NOW()
       WHERE id = u.id
      RETURNING * INTO u;
    ELSE
      INSERT INTO users (email, name)
      VALUES (normalized, NULLIF(p_name, ''))
      RETURNING * INTO u;
      INSERT INTO user_identities (user_id, issuer, subject, provider, email)
      VALUES (u.id, p_issuer, p_subject, p_provider, normalized);
    END IF;
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

REVOKE ALL ON FUNCTION auth_touch_session(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_purge_expired() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_resolve_identity(text, text, text, text, text, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_touch_session(text, timestamptz) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_purge_expired() TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_resolve_identity(text, text, text, text, text, boolean, text) TO meeting_assistant_app;
