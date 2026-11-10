-- Migration: 002_auth_memberships
-- Description: Memberships, invites, app role (NOBYPASSRLS), SECURITY DEFINER auth lookups.
-- Extends FORGE scaffold tables (tenants, users, sessions, oidc_login_state). No price columns.

-- =============================================
-- EXTEND EXISTING TABLES
-- =============================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan_code TEXT NOT NULL DEFAULT 'pilot',
  ADD COLUMN IF NOT EXISTS seat_limit INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'pilot';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_seat_limit_check'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_seat_limit_check CHECK (seat_limit >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_billing_status_check'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_billing_status_check
      CHECK (billing_status IN ('pilot', 'active', 'past_due', 'canceled'));
  END IF;
END $$;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS idle_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
  ADD COLUMN IF NOT EXISTS active_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

ALTER TABLE oidc_login_state
  ADD COLUMN IF NOT EXISTS code_verifier TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oidc_login_state_provider_check'
  ) THEN
    ALTER TABLE oidc_login_state ADD CONSTRAINT oidc_login_state_provider_check
      CHECK (provider IN ('google', 'microsoft'));
  END IF;
END $$;

-- =============================================
-- MEMBERSHIPS (§5.5) AND INVITES (accept hook)
-- =============================================

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  seat_status TEXT NOT NULL DEFAULT 'active' CHECK (seat_status IN ('invited', 'active', 'deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_tenant_id ON invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(lower(email));

-- =============================================
-- APP ROLE: non-owner, NOBYPASSRLS
-- =============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meeting_assistant_app') THEN
    CREATE ROLE meeting_assistant_app
      NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOLOGIN NOBYPASSRLS;
  ELSE
    ALTER ROLE meeting_assistant_app NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO meeting_assistant_app;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO meeting_assistant_app', current_database());
END $$;

-- Tenant-scoped tables the app role may touch directly (with tenant context).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  meetings, transcripts, meeting_analysis, email_deliveries, tenant_settings, memberships, invites
TO meeting_assistant_app;

-- Global tables: denied by default. Lookups go through SECURITY DEFINER functions.
REVOKE ALL ON TABLE tenants, users, webhook_events, sessions, oidc_login_state FROM PUBLIC;
REVOKE ALL ON TABLE tenants, users, webhook_events, sessions, oidc_login_state FROM meeting_assistant_app;

-- =============================================
-- RLS on memberships / invites (sessions denied via REVOKE)
-- FORCE RLS on every table is P2-2.
-- =============================================

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oidc_login_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS invites_tenant_isolation ON invites;
CREATE POLICY invites_tenant_isolation ON invites
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Global tables: no policy → non-owners (including the app role) see zero rows if GRANT is added later.

-- =============================================
-- SECURITY DEFINER LOOKUPS (pinned search_path)
-- =============================================

CREATE OR REPLACE FUNCTION auth_store_oidc_state(
  p_state text,
  p_nonce text,
  p_code_verifier text,
  p_provider text,
  p_redirect_uri text,
  p_invite_token_hash text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO oidc_login_state (state, nonce, code_verifier, provider, redirect_uri, invite_token_hash, expires_at)
  VALUES (p_state, p_nonce, p_code_verifier, p_provider, p_redirect_uri, p_invite_token_hash, p_expires_at)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION auth_consume_oidc_state(p_state text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_oidc oidc_login_state%ROWTYPE;
BEGIN
  DELETE FROM oidc_login_state
  WHERE state = p_state
  RETURNING * INTO row_oidc;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF row_oidc.expires_at <= clock_timestamp() THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', row_oidc.id,
    'state', row_oidc.state,
    'nonce', row_oidc.nonce,
    'code_verifier', row_oidc.code_verifier,
    'provider', row_oidc.provider,
    'redirect_uri', row_oidc.redirect_uri,
    'invite_token_hash', row_oidc.invite_token_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION auth_upsert_user(p_email text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  u users%ROWTYPE;
  normalized text := lower(btrim(p_email));
BEGIN
  INSERT INTO users (email, name)
  VALUES (normalized, NULLIF(p_name, ''))
  ON CONFLICT (email) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, users.name),
        updated_at = NOW()
  RETURNING * INTO u;

  RETURN jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name);
END;
$$;

CREATE OR REPLACE FUNCTION auth_memberships_for_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'created_at')), '[]'::jsonb)
  INTO result
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
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN tenants t ON t.id = m.tenant_id
    WHERE u.email = lower(btrim(p_email))
  ) q;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION auth_create_session(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_idle_expires_at timestamptz,
  p_active_tenant_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at, last_seen_at, active_tenant_id)
  VALUES (p_user_id, p_token_hash, p_expires_at, p_idle_expires_at, clock_timestamp(), p_active_tenant_id)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION auth_session_context(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'session_id', s.id,
    'expires_at', s.expires_at,
    'idle_expires_at', s.idle_expires_at,
    'active_tenant_id', s.active_tenant_id,
    'user', jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'name', u.name
    ),
    'memberships', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'role', m.role,
          'seat_status', m.seat_status,
          'tenant', jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'slug', t.slug
          )
        )
        ORDER BY m.created_at
      )
      FROM memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = u.id
    ), '[]'::jsonb)
  )
  INTO result
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.expires_at > clock_timestamp()
    AND s.idle_expires_at > clock_timestamp();

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION auth_touch_session(p_token_hash text, p_idle_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE sessions
     SET last_seen_at = clock_timestamp(),
         idle_expires_at = p_idle_expires_at
   WHERE token_hash = p_token_hash
     AND expires_at > clock_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION auth_delete_session(p_token_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM sessions WHERE token_hash = p_token_hash;
END;
$$;

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
    AND accepted_at IS NULL
    AND expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INVITE');
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

REVOKE ALL ON FUNCTION auth_store_oidc_state(text, text, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_consume_oidc_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_upsert_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_memberships_for_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_create_session(uuid, text, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_session_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_touch_session(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_delete_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_accept_invite(text, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_store_oidc_state(text, text, text, text, text, text, timestamptz) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_consume_oidc_state(text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_upsert_user(text, text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_memberships_for_email(text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_create_session(uuid, text, timestamptz, timestamptz, uuid) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_session_context(text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_touch_session(text, timestamptz) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_delete_session(text) TO meeting_assistant_app;
GRANT EXECUTE ON FUNCTION auth_accept_invite(text, uuid, text) TO meeting_assistant_app;

-- =============================================
-- SYNTHETIC DEV SEED (example.com / Acme Notes)
-- =============================================

INSERT INTO tenants (id, name, slug, plan_code, seat_limit, billing_status)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Acme Notes',
  'acme-notes',
  'pilot',
  10,
  'pilot'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, retention_days)
VALUES ('00000000-0000-0000-0000-000000000010', 365)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO users (id, email, name) VALUES
  ('00000000-0000-0000-0000-000000000011', 'owner@example.com', 'Avery Owner'),
  ('00000000-0000-0000-0000-000000000012', 'admin@example.com', 'Riley Admin'),
  ('00000000-0000-0000-0000-000000000013', 'member@example.com', 'Morgan Member'),
  ('00000000-0000-0000-0000-000000000014', 'outsider@example.com', 'Quinn Outsider'),
  ('00000000-0000-0000-0000-000000000015', 'invited@example.com', 'Casey Invited')
ON CONFLICT (id) DO NOTHING;

-- Existing scaffold user is owner of the Lumen & Vale Beauty tenant.
INSERT INTO memberships (id, tenant_id, user_id, role, seat_status)
VALUES
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011',
    'owner',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000012',
    'admin',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000024',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000013',
    'member',
    'active'
  ),
  (
    '00000000-0000-0000-0000-000000000025',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000015',
    'member',
    'invited'
  )
ON CONFLICT (tenant_id, user_id) DO NOTHING;
