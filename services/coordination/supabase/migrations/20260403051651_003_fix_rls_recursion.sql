-- Fix: participants RLS policy references itself causing infinite recursion
-- Drop the self-referencing policy and replace with a direct check

DROP POLICY IF EXISTS "users_read_project_participants" ON participants;

-- Authenticated users can read participants if they share the same project
-- Use a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM participants
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

CREATE POLICY "users_read_project_participants" ON participants FOR SELECT USING (
  user_has_project_access(project_id)
);

-- Also fix issues policy which joins through participants (could also recurse)
DROP POLICY IF EXISTS "users_read_project_issues" ON issues;
CREATE POLICY "users_read_project_issues" ON issues FOR SELECT USING (
  user_has_project_access(project_id)
);

-- Fix comments policy
DROP POLICY IF EXISTS "users_read_issue_comments" ON issue_comments;
CREATE POLICY "users_read_issue_comments" ON issue_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues WHERE issues.id = issue_comments.issue_id
    AND user_has_project_access(issues.project_id))
);

-- Fix activity log policy
DROP POLICY IF EXISTS "users_read_activity_log" ON issue_activity_log;
CREATE POLICY "users_read_activity_log" ON issue_activity_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues WHERE issues.id = issue_activity_log.issue_id
    AND user_has_project_access(issues.project_id))
);

-- Fix documents policy
DROP POLICY IF EXISTS "users_read_issue_documents" ON issue_documents;
CREATE POLICY "users_read_issue_documents" ON issue_documents FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues WHERE issues.id = issue_documents.issue_id
    AND user_has_project_access(issues.project_id))
);

-- Fix nudge log policy
DROP POLICY IF EXISTS "admins_read_nudge_log" ON nudge_log;
CREATE POLICY "admins_read_nudge_log" ON nudge_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM participants
    WHERE participants.project_id = nudge_log.project_id
      AND participants.user_id = auth.uid()
      AND participants.role = 'admin'
      AND participants.is_active = true)
);

-- Fix AI communications policy
DROP POLICY IF EXISTS "admins_read_ai_communications" ON ai_communications;
CREATE POLICY "admins_read_ai_communications" ON ai_communications FOR SELECT USING (
  EXISTS (SELECT 1 FROM issues
    JOIN participants ON participants.project_id = issues.project_id
    WHERE issues.id = ai_communications.issue_id
      AND participants.user_id = auth.uid()
      AND participants.role = 'admin'
      AND participants.is_active = true)
);
