-- Migration: 20261110230700_resolve_meeting_tenant_not_found
-- Unclaimed tenant, missing meeting, and tenant mismatch all return
-- NOT_FOUND with no tenant_id or meeting_id. Callers must not get a
-- TENANT_MISMATCH oracle.

CREATE OR REPLACE FUNCTION resolve_meeting_tenant(
  p_recall_bot_id text,
  p_claimed_tenant_id uuid,
  p_claimed_meeting_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  found_id uuid;
  found_tenant uuid;
BEGIN
  IF p_claimed_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF p_claimed_meeting_id IS NOT NULL THEN
    SELECT m.id, m.tenant_id INTO found_id, found_tenant
    FROM meetings m
    WHERE m.id = p_claimed_meeting_id;
  END IF;

  IF found_id IS NULL AND p_recall_bot_id IS NOT NULL AND btrim(p_recall_bot_id) <> '' THEN
    SELECT m.id, m.tenant_id INTO found_id, found_tenant
    FROM meetings m
    WHERE m.recall_bot_id = p_recall_bot_id;
  END IF;

  IF found_id IS NULL OR found_tenant IS DISTINCT FROM p_claimed_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tenant_id', found_tenant,
    'meeting_id', found_id
  );
END;
$$;
