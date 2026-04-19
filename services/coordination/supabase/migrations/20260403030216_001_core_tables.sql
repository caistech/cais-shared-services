-- @gbta/coordination — Phase 1 Core Tables
-- Cross-project issue tracking and multi-party coordination

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-----------------------------------------------------------
-- 1. Projects
-----------------------------------------------------------
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_slug ON projects(slug);

-----------------------------------------------------------
-- 2. Participants
-----------------------------------------------------------
CREATE TYPE participant_role AS ENUM (
  'admin', 'internal', 'engineer', 'certifier', 'supplier', 'client'
);

CREATE TABLE participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        participant_role NOT NULL,
  company     TEXT,
  phone       TEXT,
  user_id     UUID,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, email)
);

CREATE INDEX idx_participants_project ON participants(project_id);
CREATE INDEX idx_participants_email ON participants(email);
CREATE INDEX idx_participants_user ON participants(user_id) WHERE user_id IS NOT NULL;

-----------------------------------------------------------
-- 3. Issues
-----------------------------------------------------------
CREATE TYPE issue_criticality AS ENUM ('high', 'medium', 'low');
CREATE TYPE issue_status AS ENUM ('open', 'in_progress', 'blocked', 'completed', 'cancelled');

CREATE TABLE issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  criticality     issue_criticality NOT NULL DEFAULT 'medium',
  status          issue_status NOT NULL DEFAULT 'open',
  created_by      UUID NOT NULL REFERENCES participants(id),
  responsible_id  UUID REFERENCES participants(id),
  next_action     TEXT,
  due_date        DATE,
  resolved_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_issues_project ON issues(project_id);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_responsible ON issues(responsible_id);
-- Overdue detection done at query time (CURRENT_DATE is not immutable for partial indexes)
-- Query: WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')

-----------------------------------------------------------
-- 4. Issue Comments
-----------------------------------------------------------
CREATE TABLE issue_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id),
  content         TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'magic_link', 'email')),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_issue ON issue_comments(issue_id, created_at);

-----------------------------------------------------------
-- 5. Issue Activity Log (append-only)
-----------------------------------------------------------
CREATE TYPE activity_type AS ENUM (
  'created', 'status_changed', 'reassigned', 'commented',
  'document_uploaded', 'document_removed', 'due_date_changed',
  'criticality_changed', 'nudge_sent', 'email_sent',
  'magic_link_used', 'approved', 'rejected'
);

CREATE TABLE issue_activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  participant_id  UUID REFERENCES participants(id),
  activity_type   activity_type NOT NULL,
  description     TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_issue ON issue_activity_log(issue_id, created_at);

-----------------------------------------------------------
-- 6. Issue Documents
-----------------------------------------------------------
CREATE TABLE issue_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES participants(id),
  file_name       TEXT NOT NULL,
  file_size       INTEGER NOT NULL,
  mime_type       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('dashboard', 'magic_link', 'email')),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_issue ON issue_documents(issue_id);

-----------------------------------------------------------
-- 7. Magic Links
-----------------------------------------------------------
CREATE TABLE magic_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      TEXT NOT NULL UNIQUE,
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  allowed_actions TEXT[] NOT NULL DEFAULT '{}',
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_links_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_active ON magic_links(expires_at) WHERE revoked_at IS NULL;

-----------------------------------------------------------
-- 8. Nudge Log
-----------------------------------------------------------
CREATE TABLE nudge_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  issue_id        UUID REFERENCES issues(id),
  nudge_type      TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  participant_id  UUID NOT NULL REFERENCES participants(id),
  recipient_email TEXT,
  payload         JSONB DEFAULT '{}',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actioned_at     TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nudge_participant_type ON nudge_log(participant_id, nudge_type, sent_at DESC);
CREATE INDEX idx_nudge_unactioned ON nudge_log(participant_id) WHERE actioned_at IS NULL;

-----------------------------------------------------------
-- 9. AI Communications Log
-----------------------------------------------------------
CREATE TABLE ai_communications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id        UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id),
  role_framing    TEXT NOT NULL,
  generated_text  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'fallback')),
  fallback_used   BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_comms_issue ON ai_communications(issue_id);

-----------------------------------------------------------
-- Auto-update triggers
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_participants_updated BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_issues_updated BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-----------------------------------------------------------
-- RLS
-----------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_communications ENABLE ROW LEVEL SECURITY;

-- Authenticated users read projects they participate in
CREATE POLICY "users_read_own_projects" ON projects FOR SELECT USING (
  EXISTS (SELECT 1 FROM participants WHERE participants.project_id = projects.id
    AND participants.user_id = auth.uid() AND participants.is_active = true)
);

-- Authenticated users read participants in their projects
CREATE POLICY "users_read_project_participants" ON participants FOR SELECT USING (
  EXISTS (SELECT 1 FROM participants AS p WHERE p.project_id = participants.project_id
    AND p.user_id = auth.uid() AND p.is_active = true)
);

-- Authenticated users read issues in their projects
CREATE POLICY "users_read_project_issues" ON issues FOR SELECT USING (
  EXISTS (SELECT 1 FROM participants WHERE participants.project_id = issues.project_id
    AND participants.user_id = auth.uid() AND participants.is_active = true)
);

-- Authenticated users read comments on their project issues
CREATE POLICY "users_read_issue_comments" ON issue_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues JOIN participants ON participants.project_id = issues.project_id
    WHERE issues.id = issue_comments.issue_id AND participants.user_id = auth.uid()
    AND participants.is_active = true)
);

-- Authenticated users read activity log for their project issues
CREATE POLICY "users_read_activity_log" ON issue_activity_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues JOIN participants ON participants.project_id = issues.project_id
    WHERE issues.id = issue_activity_log.issue_id AND participants.user_id = auth.uid()
    AND participants.is_active = true)
);

-- Authenticated users read documents for their project issues
CREATE POLICY "users_read_issue_documents" ON issue_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues JOIN participants ON participants.project_id = issues.project_id
    WHERE issues.id = issue_documents.issue_id AND participants.user_id = auth.uid()
    AND participants.is_active = true)
);

-- Admin participants read nudge log
CREATE POLICY "admins_read_nudge_log" ON nudge_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM participants WHERE participants.project_id = nudge_log.project_id
    AND participants.user_id = auth.uid() AND participants.role = 'admin'
    AND participants.is_active = true)
);

-- Admin participants read AI communications
CREATE POLICY "admins_read_ai_communications" ON ai_communications FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues JOIN participants ON participants.project_id = issues.project_id
    WHERE issues.id = ai_communications.issue_id AND participants.user_id = auth.uid()
    AND participants.role = 'admin' AND participants.is_active = true)
);

-----------------------------------------------------------
-- Enable Realtime
-----------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE issues;
ALTER PUBLICATION supabase_realtime ADD TABLE issue_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE issue_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE issue_documents;

-----------------------------------------------------------
-- Storage bucket
-----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coordination-documents',
  'coordination-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/dxf', 'image/vnd.dwg',
    'text/plain', 'text/csv'
  ]
);

CREATE POLICY "authenticated_read_documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'coordination-documents' AND auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "service_role_insert_documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'coordination-documents' AND auth.role() = 'service_role');
CREATE POLICY "service_role_delete_documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'coordination-documents' AND auth.role() = 'service_role');
