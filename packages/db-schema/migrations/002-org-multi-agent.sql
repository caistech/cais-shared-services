-- Migration 002: Multi-tenancy, multi-agent, activity tracking, audit, consent
-- Run this against your Supabase project SQL editor
-- Depends on: 001-create-tables.sql

-- ============================================================
-- 1. ORGANISATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  data_retention_days INT DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. EXTEND PROFILES
-- ============================================================

-- Add org membership and role to existing profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN org_id UUID REFERENCES organisations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role TEXT
      CHECK (role IN ('owner','admin','manager','employee'))
      DEFAULT 'employee';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles(org_id);

-- ============================================================
-- 3. HELPER FUNCTION: get_user_org_id
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_org_id(uid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM profiles WHERE id = uid;
$$;

-- Helper: get user role within their org
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- ============================================================
-- 4. ORG AGENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS org_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('assistant','coach')),
  openclaw_agent_id TEXT,
  system_prompt TEXT NOT NULL,
  tool_permissions JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, employee_user_id, agent_role)
);

ALTER TABLE org_agents ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_org_agents_org ON org_agents(org_id);
CREATE INDEX IF NOT EXISTS idx_org_agents_employee ON org_agents(employee_user_id);

-- ============================================================
-- 5. ACTIVITY LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- 'app_usage','calendar','email','crm','manual_checkin'
  source TEXT,                  -- 'browser_ext','ghl','google','manual'
  summary TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_log_org_user_time
  ON activity_log(org_id, user_id, created_at DESC);

-- ============================================================
-- 6. AGENT AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES org_agents(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,        -- 'data_read','data_write','llm_call','tool_invoke','recommendation','data_retention_purge'
  resource TEXT,               -- what was accessed (table name, API endpoint, file path)
  detail JSONB DEFAULT '{}',   -- request/response summary (NOT full payloads — PII risk)
  llm_provider TEXT,           -- 'anthropic','openai','openrouter','self_hosted'
  tokens_sent INT,
  tokens_received INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
  ON agent_audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_agent_time
  ON agent_audit_log(agent_id, created_at DESC);

-- ============================================================
-- 7. CONSENT RECORDS
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,  -- 'activity_tracking','email_access','crm_access','coaching','task_delegation'
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_consent_org_user_type
  ON consent_records(org_id, user_id, consent_type);

-- ============================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- --- Organisations ---
-- Users can see their own org
CREATE POLICY org_member_select ON organisations
  FOR SELECT USING (id = get_user_org_id(auth.uid()));

-- Only owners can update org settings
CREATE POLICY org_owner_update ON organisations
  FOR UPDATE USING (
    id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) = 'owner'
  );

-- --- Profiles (extend existing) ---
-- Users in same org can see each other's profiles
CREATE POLICY profiles_org_select ON profiles
  FOR SELECT USING (org_id = get_user_org_id(auth.uid()));

-- Users can update own profile
CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (id = auth.uid());

-- --- Org Agents ---
-- Admins+ can see all agents in their org
CREATE POLICY agents_admin_select ON org_agents
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin','manager')
  );

-- Employees can see their own agents
CREATE POLICY agents_employee_own ON org_agents
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND employee_user_id = auth.uid()
  );

-- Only admins+ can create/update/delete agents
CREATE POLICY agents_admin_insert ON org_agents
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin')
  );

CREATE POLICY agents_admin_update ON org_agents
  FOR UPDATE USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin')
  );

CREATE POLICY agents_admin_delete ON org_agents
  FOR DELETE USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin')
  );

-- --- Activity Log: Tiered Access ---
-- Employees see only their own activity
CREATE POLICY activity_employee_own ON activity_log
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND user_id = auth.uid()
  );

-- Managers see all activity in their org
CREATE POLICY activity_manager_team ON activity_log
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin','manager')
  );

-- Only system/service role inserts activity (agents write via service key)
-- No user-facing insert policy — inserts happen through API with service role

-- --- Agent Audit Log: Admins Only ---
CREATE POLICY audit_admin_select ON agent_audit_log
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin')
  );

-- No user-facing insert — audit writes happen through service role

-- --- Consent Records ---
-- Employees see their own consent
CREATE POLICY consent_self_select ON consent_records
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND user_id = auth.uid()
  );

-- Admins can see all consent in their org
CREATE POLICY consent_admin_select ON consent_records
  FOR SELECT USING (
    org_id = get_user_org_id(auth.uid())
    AND get_user_role(auth.uid()) IN ('owner','admin')
  );

-- Employees can insert/update their own consent
CREATE POLICY consent_self_insert ON consent_records
  FOR INSERT WITH CHECK (
    org_id = get_user_org_id(auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY consent_self_update ON consent_records
  FOR UPDATE USING (
    org_id = get_user_org_id(auth.uid())
    AND user_id = auth.uid()
  );

-- ============================================================
-- 9. UPDATE EXISTING TABLES — Add org_id where missing
-- ============================================================

-- Add org_id to chat_messages if it exists and lacks the column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_messages' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN org_id UUID REFERENCES organisations(id);
  END IF;
END $$;

-- Add org_id to invocations if it lacks the column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invocations' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE invocations ADD COLUMN org_id UUID REFERENCES organisations(id);
  END IF;
END $$;

-- Add org_id to memory_entries if it lacks the column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_entries' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE memory_entries ADD COLUMN org_id UUID REFERENCES organisations(id);
  END IF;
END $$;

-- ============================================================
-- 10. VERIFY
-- ============================================================
-- Run after migration to confirm:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--     ORDER BY tablename;
--   SELECT policyname, tablename FROM pg_policies
--     WHERE schemaname = 'public' ORDER BY tablename, policyname;
