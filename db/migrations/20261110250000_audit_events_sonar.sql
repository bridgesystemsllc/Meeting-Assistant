-- Migration: 20261110250000_audit_events_sonar
-- Description: Erasure-safe append-only audit_events. Drops FKs so tenant
-- offboarding and user deletion are not blocked, stores invitee emails as
-- HMAC + masked form, constrains action to the shared enum, stamps
-- created_at with now(), and allows mutation only when a SECURITY DEFINER
-- purge function sets app.audit_purge. Sorts after 20261110231000 (seat
-- cap) and 20261110240000 (audit_events).

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_tenant_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS email_hmac text,
  ADD COLUMN IF NOT EXISTS email_masked text;

ALTER TABLE audit_events
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_action_check;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_action_check CHECK (action IN (
    'login',
    'logout',
    'failed-login',
    'failed-invite',
    'invite.sent',
    'invite.resent',
    'invite.revoked',
    'invite.accepted',
    'member.deactivated',
    'member.reactivated',
    'member.role_changed',
    'branding.updated',
    'meeting.bot_dispatched',
    'meeting.deleted'
  ));

CREATE OR REPLACE FUNCTION audit_events_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_stamp ON audit_events;
CREATE TRIGGER audit_events_stamp
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_stamp();

CREATE OR REPLACE FUNCTION audit_events_enforce_actor_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.actor_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- failed-* may fire before a membership exists for this tenant.
  IF NEW.action IN ('failed-login', 'failed-invite') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM memberships m
     WHERE m.user_id = NEW.actor_user_id
       AND m.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'audit actor is not a member of tenant'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_actor_tenant ON audit_events;
CREATE TRIGGER audit_events_actor_tenant
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_enforce_actor_tenant();

CREATE OR REPLACE FUNCTION audit_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'audit_events is append-only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF current_setting('app.audit_purge', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION purge_audit_tenant(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.audit_purge', '1', true);
  DELETE FROM audit_events WHERE tenant_id = p_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION purge_audit_user(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.audit_purge', '1', true);
  UPDATE audit_events
     SET actor_user_id = NULL
   WHERE actor_user_id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM audit_events
   WHERE target_type = 'user'
     AND target_id = p_user_id;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION purge_audit_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_audit_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_audit_tenant(uuid) FROM meeting_assistant_app;
REVOKE ALL ON FUNCTION purge_audit_user(uuid) FROM meeting_assistant_app;
