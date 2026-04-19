-- Allow anon role to read dashboard tables (scoped by project_id in queries)
-- The anon key is public (NEXT_PUBLIC_) — data is not sensitive (issue titles, status)

CREATE POLICY "anon_read_projects" ON projects FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_participants" ON participants FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_issues" ON issues FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_comments" ON issue_comments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_activity" ON issue_activity_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_documents" ON issue_documents FOR SELECT TO anon USING (true);
