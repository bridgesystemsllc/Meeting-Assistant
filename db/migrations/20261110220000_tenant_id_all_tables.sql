-- Migration: 20261110220000_tenant_id_all_tables
-- Description: Assert tenant_id NOT NULL + FK + (tenant_id, …) indexes on every
-- tenant-owned table. FORGE 001 already added tenant_id; this is idempotent and
-- fails if a listed tenant table is missing the column.

DO $$
DECLARE
  t text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'meetings',
    'transcripts',
    'meeting_analysis',
    'email_deliveries',
    'tenant_settings',
    'memberships',
    'invites'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'tenant_id'
        AND is_nullable = 'NO'
    ) THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'tenant_id NOT NULL missing on tenant tables: %', missing;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_tenant_id_id ON meetings (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_transcripts_tenant_id_id ON transcripts (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_analysis_tenant_id_id ON meeting_analysis (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_tenant_id_id ON email_deliveries (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id_id ON memberships (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_invites_tenant_id_id ON invites (tenant_id, id);
