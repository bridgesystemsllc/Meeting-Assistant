-- Migration: 20261110230500_app_role_nosuperuser_guard
-- 002's insufficient_privilege fallback only inspected rolbypassrls.
-- Hosts that already applied 002 will not re-run it, so this trailing
-- migration is the portable check. Role attributes are unchanged.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meeting_assistant_app') THEN
    RAISE EXCEPTION
      'Role meeting_assistant_app is missing. Run db/bootstrap-roles.sql as a superuser, then re-run migrations.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'meeting_assistant_app'
      AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE EXCEPTION
      'meeting_assistant_app must be NOSUPERUSER and NOBYPASSRLS; a superuser must run db/bootstrap-roles.sql';
  END IF;
END $$;
