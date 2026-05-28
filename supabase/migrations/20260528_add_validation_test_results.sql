-- Add Validation Test Results to Product Validation Status
-- Captures Parts A-D test outcomes from VALIDATION_TEST_PLAN_BOTH_PORTALS.md
-- Created: 2026-05-28
-- Purpose: Display validation test status on product cards (admin portal + user portal + auth + scaffold)

-- Add validation test results columns to product_validation_status
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS validation_test_results JSONB DEFAULT NULL;

-- Detailed breakdown of test results (Parts A-D from the validation plan)
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS test_part_a_admin_portal TEXT CHECK (test_part_a_admin_portal IN ('passed', 'warning', 'failed', 'not_run'));
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS test_part_b_user_portal TEXT CHECK (test_part_b_user_portal IN ('passed', 'warning', 'failed', 'not_run'));
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS test_part_c_auth_flows TEXT CHECK (test_part_c_auth_flows IN ('passed', 'warning', 'failed', 'not_run'));
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS test_part_d_scaffold_verify TEXT CHECK (test_part_d_scaffold_verify IN ('passed', 'warning', 'failed', 'not_run'));

-- Overall validation test readiness (composite of all parts)
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS validation_test_status TEXT CHECK (validation_test_status IN ('passed', 'warning', 'failed', 'not_run')) DEFAULT 'not_run';

-- Timestamp of last validation test run
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS last_validation_test_run TIMESTAMP WITH TIME ZONE;

-- Tester who ran the validation (admin email)
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS last_validation_test_by UUID;

-- Detailed findings from validation tests (stores specific gaps found)
ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS validation_test_findings TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Examples:
-- ARRAY[
--   'Settings page missing',
--   'Password visibility toggle not present',
--   'Magic link flow failed (rate limited)',
--   'Profiles table RLS not enforced',
--   'Test user incorrectly blocked from admin routes'
-- ]

-- JSON structure for validation_test_results (for complex data):
-- {
--   "parts": {
--     "a_admin_portal": {
--       "status": "passed|warning|failed",
--       "checks": {
--         "admin_access": { "status": "passed", "note": "Both admins can access /admin/*" },
--         "settings_profile": { "status": "passed", "note": "Profile fields rendered and save works" },
--         "settings_password": { "status": "passed", "note": "Eye toggle present and functional" },
--         "settings_notifications": { "status": "passed", "note": "All toggles working" },
--         "sign_out_everywhere": { "status": "failed", "note": "Button not found in Settings" },
--         "delete_account": { "status": "passed", "note": "Hard-delete works, cascade cleans profiles" }
--       }
--     },
--     "b_user_portal": {
--       "status": "passed|warning|failed",
--       "checks": {
--         "user_access": { "status": "passed", "note": "Test user can access product" },
--         "admin_denied": { "status": "passed", "note": "Test user gets 403 at /admin/*" },
--         "settings": { "status": "passed", "note": "Can update profile/password/notifications" },
--         "sign_out": { "status": "passed", "note": "Session cleared after sign out" },
--         "feature_nav": { "status": "warning", "note": "One feature page returned 500" }
--       }
--     },
--     "c_auth_flows": {
--       "status": "passed|warning|failed",
--       "checks": {
--         "signup": { "status": "passed", "note": "Email confirmed, session created" },
--         "login": { "status": "passed", "note": "Eye toggle works, login succeeds" },
--         "forgot_password": { "status": "passed", "note": "Reset email delivered, new password works" },
--         "magic_link": { "status": "warning", "note": "Email rate limited to 3/hour on default Supabase SMTP" }
--       }
--     },
--     "d_scaffold": {
--       "status": "passed|warning|failed",
--       "checks": {
--         "admin_emails_set": { "status": "passed", "note": "Both admins in ADMIN_EMAILS env var" },
--         "test_user_created": { "status": "passed", "note": "dennis@factory2key.com.au provisioned" },
--         "test_user_not_admin": { "status": "passed", "note": "Test user correctly non-admin" },
--         "profiles_table": { "status": "passed", "note": "Table exists with required columns" },
--         "profiles_trigger": { "status": "passed", "note": "on_auth_user_created fires on signup" },
--         "profiles_rls": { "status": "passed", "note": "RLS enforced correctly" },
--         "email_infrastructure": { "status": "passed", "note": "All emails from noreply@updates.corporateaisolutions.com" }
--       }
--     }
--   },
--   "summary": {
--     "total_checks": 28,
--     "passed": 26,
--     "warning": 1,
--     "failed": 1,
--     "composite_status": "warning",
--     "tester": "dennis@corporateaisolutions.com",
--     "test_duration_minutes": 45,
--     "tested_at": "2026-05-28T14:30:00Z"
--   }
-- }

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_product_validation_test_status 
  ON product_validation_status(validation_test_status);

CREATE INDEX IF NOT EXISTS idx_product_validation_test_run 
  ON product_validation_status(last_validation_test_run DESC);

-- Allow admins to update test results
-- (RLS policies already exist for authenticated users = admins via middleware)

COMMENT ON COLUMN product_validation_status.validation_test_results IS 'Full JSON structure of validation test results (Parts A-D)';
COMMENT ON COLUMN product_validation_status.test_part_a_admin_portal IS 'Part A validation: Admin Portal access, Settings, Sign Out (passed|warning|failed|not_run)';
COMMENT ON COLUMN product_validation_status.test_part_b_user_portal IS 'Part B validation: Test User access, Admin denial, Settings, Sign Out, feature nav (passed|warning|failed|not_run)';
COMMENT ON COLUMN product_validation_status.test_part_c_auth_flows IS 'Part C validation: Signup, Login, Forgot Password, Magic Link flows (passed|warning|failed|not_run)';
COMMENT ON COLUMN product_validation_status.test_part_d_scaffold_verify IS 'Part D validation: Admin/test user provisioning, profiles table, RLS, email infrastructure (passed|warning|failed|not_run)';
COMMENT ON COLUMN product_validation_status.validation_test_status IS 'Overall validation test status (composite of Parts A-D)';
COMMENT ON COLUMN product_validation_status.validation_test_findings IS 'Array of specific gaps found during validation (e.g., "Settings page missing", "Magic link rate limited")';
COMMENT ON COLUMN product_validation_status.last_validation_test_run IS 'Timestamp when validation tests were last executed';
COMMENT ON COLUMN product_validation_status.last_validation_test_by IS 'User ID of the admin who ran the validation tests';
