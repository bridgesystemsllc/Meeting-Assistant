-- Migration: 20261110253000_failed_invite_once_per_invite_code
-- Description: One failed-invite audit row per (invite, code). Later
-- lookups of the same invite+code do not insert another row. A different
-- code on the same invite may still write a distinct row. Sorts after
-- 20261110252000.

CREATE UNIQUE INDEX IF NOT EXISTS audit_events_failed_invite_once_idx
  ON audit_events (tenant_id, target_id, (metadata->>'code'))
  WHERE action = 'failed-invite' AND target_id IS NOT NULL;
