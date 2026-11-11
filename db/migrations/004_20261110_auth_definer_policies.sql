-- Migration: 004_20261110_auth_definer_policies
-- SECURITY DEFINER auth_* functions run as the role that created them (the
-- migration owner). On managed Postgres that owner is NOSUPERUSER NOBYPASSRLS.
-- Global tables have RLS enabled (user_identities is FORCE'd), so without a
-- policy the definer sees zero rows and cannot insert sessions/identities.
--
-- These policies are granted only to the migration role (current_user), not to
-- meeting_assistant_app. Tenant isolation policies on memberships/invites stay.

DO $$
DECLARE
  definer name := current_user;
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants',
    'users',
    'sessions',
    'oidc_login_state',
    'webhook_events',
    'user_identities',
    'memberships',
    'invites'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_definer ON %I', t);
    EXECUTE format(
      'CREATE POLICY auth_definer ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
      t,
      definer
    );
  END LOOP;
END $$;
