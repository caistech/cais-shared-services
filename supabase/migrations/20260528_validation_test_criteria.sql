-- Validation Test Checks as Readiness Criteria
-- Maps each check from VALIDATION_TEST_PLAN_BOTH_PORTALS.md to a readiness_criteria
-- entry so recordReadiness FK constraint works and scoring engine can weight them.
-- Part of the 20% validation test contribution to overall readiness score.
-- Created: 2026-05-28

-- Part A: Admin Portal (6 checks)
INSERT INTO readiness_criteria (code, check_label, source, method, tier, weight, relevance, sort_order)
VALUES
  ('VT_A1', 'Admin Portal Access — /admin pages load, no auth block', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 100),
  ('VT_A2', 'Admin Settings Profile — fields render + save', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 101),
  ('VT_A3', 'Admin Settings Password — eye toggle present', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 102),
  ('VT_A4', 'Admin Settings Notifications — toggles work', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 103),
  ('VT_A5', 'Admin Sign Out Everywhere — revokes all sessions', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 104),
  ('VT_A6', 'Admin Delete Account — hard-deletes + cascade clean', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 105)
ON CONFLICT (code) DO NOTHING;

-- Part B: User Portal (5 checks)
INSERT INTO readiness_criteria (code, check_label, source, method, tier, weight, relevance, sort_order)
VALUES
  ('VT_B1', 'User Portal Access — surfaces load, no auth block', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 200),
  ('VT_B2', 'User Blocked from /admin — 401/403 for non-admin', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 201),
  ('VT_B3', 'User Settings — can update profile/password/notifications', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 202),
  ('VT_B4', 'User Sign Out — session cleared, redirect to login', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 203),
  ('VT_B5', 'User Feature Navigation — core surfaces load without errors', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 204)
ON CONFLICT (code) DO NOTHING;

-- Part C: Auth Flows (4 checks)
INSERT INTO readiness_criteria (code, check_label, source, method, tier, weight, relevance, sort_order)
VALUES
  ('VT_C1', 'Auth Signup — email confirmation + session established', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 300),
  ('VT_C2', 'Auth Login — eye toggle works, existing user logs in', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 301),
  ('VT_C3', 'Auth Forgot Password — reset email delivered + works', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 302),
  ('VT_C4', 'Auth Magic Link — email delivered, link logs user in', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 303)
ON CONFLICT (code) DO NOTHING;

-- Part D: Scaffold Verify (7 checks)
INSERT INTO readiness_criteria (code, check_label, source, method, tier, weight, relevance, sort_order)
VALUES
  ('VT_D1', 'Scaffold Admin Emails — both admins in ADMIN_EMAILS env var', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 400),
  ('VT_D2', 'Scaffold Test User Created — dennis@factory2key.com.au provisioned', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 401),
  ('VT_D3', 'Scaffold Test User Non-Admin — correctly blocked from /admin', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 402),
  ('VT_D4', 'Scaffold Profiles Table — schema correct with required columns', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 403),
  ('VT_D5', 'Scaffold Profiles Trigger — on_auth_user_created fires on signup', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 404),
  ('VT_D6', 'Scaffold Profiles RLS — select+update own row only', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 405),
  ('VT_D7', 'Scaffold Email Infrastructure — all from noreply@updates.corporateaisolutions.com', 'VALIDATION_TEST', 'NAIVE', 'WEIGHTED', 'Med', 'PRE', 406)
ON CONFLICT (code) DO NOTHING;
