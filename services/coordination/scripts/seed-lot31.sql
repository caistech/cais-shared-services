-- Seed: Lot 31 Lightgauge Steel Framework Certification
-- Run via: supabase db execute --project-ref ulesbsomrmwjprrhigbq -f scripts/seed-lot31.sql

-- 1. Project
INSERT INTO projects (id, name, slug, description, metadata) VALUES (
  '00000000-0000-0000-0000-000000000031',
  'Lot 31 — Lightgauge Steel Framework Certification',
  'lot-31-steel',
  'Multi-party coordination for independent structural certification of lightgauge steel framework at Lot 31. Involves remediation scope definition, engineering review, supplier response, and certifier sign-off.',
  '{"address": "Lot 31", "type": "steel_framework_certification", "stage": "remediation"}'::jsonb
);

-- 2. Participants
-- Dennis (admin/owner)
INSERT INTO participants (id, project_id, name, email, role, company) VALUES (
  '00000000-0001-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000031',
  'Dennis McMahon',
  'dennis@corporateaisolutions.com',
  'admin',
  'GBTA / Corporate AI Solutions'
);

-- Independent Engineer
INSERT INTO participants (id, project_id, name, email, role, company) VALUES (
  '00000000-0001-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000031',
  'James Chen',
  'jchen@structeng.com.au',
  'engineer',
  'Chen Structural Engineering'
);

-- Certifier
INSERT INTO participants (id, project_id, name, email, role, company) VALUES (
  '00000000-0001-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000031',
  'Mehul Patel',
  'mpatel@certify.com.au',
  'certifier',
  'Patel Building Certification'
);

-- Supplier (steel frame manufacturer)
INSERT INTO participants (id, project_id, name, email, role, company) VALUES (
  '00000000-0001-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000031',
  'SteelCo Frames',
  'projects@steelcoframes.com.au',
  'supplier',
  'SteelCo Frames Pty Ltd'
);

-- 3. Issues

-- Issue 1: Bracing connection detail (HIGH, BLOCKED)
INSERT INTO issues (id, project_id, title, description, criticality, status, created_by, responsible_id, next_action, due_date) VALUES (
  '00000000-0002-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000031',
  'Bracing connection detail revision — grid lines B3-B7',
  'Independent engineer identified that bracing connection details at grid lines B3-B7 do not comply with AS 4100 clause 9.1.4. Revised connection details required from supplier, then independent engineer must review and certifier must sign off.

Original inspection report identified insufficient moment capacity at the B5 connection point. SteelCo provided revised detail v1, engineer rejected (insufficient moment capacity calc). SteelCo provided v2 with updated AS 4100 capacity figures — awaiting engineer review.',
  'high',
  'blocked',
  '00000000-0001-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000002',
  'Review revised connection details v2 and confirm whether moment capacity at B5 now meets AS 4100 requirements, or specify further changes needed',
  '2026-04-07'
);

-- Issue 2: Top plate bolt spacing (HIGH, OPEN)
INSERT INTO issues (id, project_id, title, description, criticality, status, created_by, responsible_id, next_action, due_date) VALUES (
  '00000000-0002-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000031',
  'Top plate bolt spacing non-conformance',
  'Site inspection revealed bolt spacing on top plates in zones C1-C4 exceeds the 450mm maximum specified in the engineering drawings. Current spacing measured at 520-580mm. Requires remediation proposal from supplier.',
  'high',
  'open',
  '00000000-0001-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000004',
  'Provide remediation proposal for bolt spacing — either additional bolts or engineered justification for existing spacing',
  '2026-04-10'
);

-- Issue 3: Fire rating documentation (MEDIUM, OPEN)
INSERT INTO issues (id, project_id, title, description, criticality, status, created_by, responsible_id, next_action, due_date) VALUES (
  '00000000-0002-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000031',
  'Fire rating documentation for wall panels',
  'Certifier requires fire rating test certificates for the lightweight steel-framed wall panels to confirm FRL -/60/60 compliance per BCA Spec C1.1. Supplier to provide manufacturer test reports.',
  'medium',
  'open',
  '00000000-0001-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000004',
  'Upload panel fire rating test certificates (FRL test reports from manufacturer)',
  '2026-04-15'
);

-- Issue 4: Foundation anchor bolt alignment (LOW, COMPLETED)
INSERT INTO issues (id, project_id, title, description, criticality, status, created_by, responsible_id, next_action, due_date, resolved_at) VALUES (
  '00000000-0002-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000031',
  'Foundation anchor bolt alignment check',
  'Survey confirmed anchor bolt positions are within ±3mm tolerance per AS 4100 clause 15.3.2. No remediation required.',
  'low',
  'completed',
  '00000000-0001-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000003',
  NULL,
  '2026-03-20',
  '2026-03-20T10:00:00Z'
);

-- 4. Activity Log

-- Issue 1 activities
INSERT INTO issue_activity_log (issue_id, participant_id, activity_type, description, created_at) VALUES
  ('00000000-0002-0000-0000-000000000001', '00000000-0001-0000-0000-000000000001', 'created', 'Issue created: Bracing connection detail revision — grid lines B3-B7', '2026-03-28T09:00:00Z'),
  ('00000000-0002-0000-0000-000000000001', '00000000-0001-0000-0000-000000000004', 'document_uploaded', 'Document uploaded: Revised connection detail v1.pdf', '2026-03-28T15:00:00Z'),
  ('00000000-0002-0000-0000-000000000001', '00000000-0001-0000-0000-000000000002', 'commented', 'Comment added via dashboard', '2026-03-29T10:00:00Z'),
  ('00000000-0002-0000-0000-000000000001', '00000000-0001-0000-0000-000000000004', 'document_uploaded', 'Document uploaded: Revised connection detail v2.pdf', '2026-03-30T14:00:00Z'),
  ('00000000-0002-0000-0000-000000000001', '00000000-0001-0000-0000-000000000001', 'status_changed', 'Status changed from open to blocked', '2026-04-01T09:00:00Z');

-- Issue 2 activities
INSERT INTO issue_activity_log (issue_id, participant_id, activity_type, description, created_at) VALUES
  ('00000000-0002-0000-0000-000000000002', '00000000-0001-0000-0000-000000000001', 'created', 'Issue created: Top plate bolt spacing non-conformance', '2026-03-25T09:00:00Z');

-- Issue 3 activities
INSERT INTO issue_activity_log (issue_id, participant_id, activity_type, description, created_at) VALUES
  ('00000000-0002-0000-0000-000000000003', '00000000-0001-0000-0000-000000000001', 'created', 'Issue created: Fire rating documentation for wall panels', '2026-03-20T09:00:00Z');

-- Issue 4 activities
INSERT INTO issue_activity_log (issue_id, participant_id, activity_type, description, created_at) VALUES
  ('00000000-0002-0000-0000-000000000004', '00000000-0001-0000-0000-000000000001', 'created', 'Issue created: Foundation anchor bolt alignment check', '2026-03-15T09:00:00Z'),
  ('00000000-0002-0000-0000-000000000004', '00000000-0001-0000-0000-000000000003', 'approved', 'Certifier confirmed anchor bolt positions within tolerance', '2026-03-20T10:00:00Z'),
  ('00000000-0002-0000-0000-000000000004', '00000000-0001-0000-0000-000000000001', 'status_changed', 'Status changed from open to completed', '2026-03-20T10:00:00Z');

-- 5. Comments

-- Issue 1 comment from engineer
INSERT INTO issue_comments (issue_id, participant_id, content, source, created_at) VALUES (
  '00000000-0002-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000002',
  'First revision doesn''t address the moment capacity at B5. The calculation shows 45kNm capacity vs 62kNm demand. Need recalculation with updated section properties or a larger connection plate.',
  'dashboard',
  '2026-03-29T10:00:00Z'
);

-- Issue 1 comment from supplier
INSERT INTO issue_comments (issue_id, participant_id, content, source, created_at) VALUES (
  '00000000-0002-0000-0000-000000000001',
  '00000000-0001-0000-0000-000000000004',
  'Revised detail v2 uploaded. We have increased the connection plate from 6mm to 10mm and added 2 additional M16 bolts. Updated capacity calculation shows 78kNm which exceeds the 62kNm demand.',
  'dashboard',
  '2026-03-30T14:30:00Z'
);
