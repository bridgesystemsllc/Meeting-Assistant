-- Migration: 001_initial
-- Description: Initial schema with multi-tenant support
-- Note: RLS policies added by another team in Phase 2

-- =============================================
-- GLOBAL TABLES (no tenant_id)
-- =============================================

-- Tenants (global)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (global - memberships come later)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook events (global - for idempotency across tenants)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_bot_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recall_bot_id, event_type, event_id)
);

-- Sessions (global - for auth)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OIDC login state (global - for OAuth flows)
CREATE TABLE IF NOT EXISTS oidc_login_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state VARCHAR(255) UNIQUE NOT NULL,
  nonce VARCHAR(255) NOT NULL,
  redirect_uri TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_recall_bot_id ON webhook_events(recall_bot_id);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_oidc_state ON oidc_login_state(state);

-- =============================================
-- TENANT SETTINGS (tenant_id PK/FK)
-- =============================================

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TENANT-SCOPED TABLES (tenant_id NOT NULL FK)
-- =============================================

-- Meetings (tenant-scoped)
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  meeting_url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recall_bot_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'scheduled' NOT NULL,
  language VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meetings_tenant_id ON meetings(tenant_id);
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_recall_bot_id ON meetings(recall_bot_id);
CREATE INDEX idx_meetings_created_at ON meetings(created_at DESC);

-- Transcripts (tenant-scoped)
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  raw_transcript JSONB,
  full_text TEXT NOT NULL,
  speakers JSONB,
  word_count INTEGER DEFAULT 0,
  language VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transcripts_tenant_id ON transcripts(tenant_id);
CREATE INDEX idx_transcripts_meeting_id ON transcripts(meeting_id);

-- Meeting analysis (tenant-scoped)
CREATE TABLE IF NOT EXISTS meeting_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  key_decisions JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  topics JSONB DEFAULT '[]',
  meeting_sentiment VARCHAR(20),
  engagement_score INTEGER,
  talk_time JSONB,
  questions_raised JSONB DEFAULT '[]',
  risks_identified JSONB DEFAULT '[]',
  next_meeting_agenda JSONB DEFAULT '[]',
  raw_ai_response TEXT,
  model_used VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analysis_tenant_id ON meeting_analysis(tenant_id);
CREATE INDEX idx_analysis_meeting_id ON meeting_analysis(meeting_id);

-- Email deliveries (tenant-scoped)
CREATE TABLE IF NOT EXISTS email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_deliveries_tenant_id ON email_deliveries(tenant_id);
CREATE INDEX idx_email_deliveries_meeting_id ON email_deliveries(meeting_id);

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SEED: Synthetic dev tenant (Lumen & Vale Beauty)
-- =============================================

INSERT INTO tenants (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Lumen & Vale Beauty',
  'lumen-vale'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_settings (tenant_id, retention_days)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  365
) ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO users (id, email, name)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'dev@example.com',
  'Dev User'
) ON CONFLICT (id) DO NOTHING;
