-- Superuser (or BYPASSRLS-capable) bootstrap. Run once before migrations on
-- managed Postgres, where the migration role is NOSUPERUSER NOBYPASSRLS.
-- CREATE ROLE / ALTER ROLE … NOBYPASSRLS cannot be done by a non-superuser.
-- After this file succeeds, run db/migrations as the database owner.
--
--   psql -v ON_ERROR_STOP=1 -f db/bootstrap-roles.sql

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
