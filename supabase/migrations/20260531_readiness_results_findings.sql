-- supabase/migrations/20260531_readiness_results_findings.sql
--
-- Stage 6 wiring. readiness_results IS the punch list. The writer is
-- gate-check.mjs recordReadiness() — which is APPEND-ONLY (history-preserving;
-- the scorer takes the latest row per check_code). So:
--   * NO unique(product_slug, check_code) — that would break the second write.
--   * latest-per-code is resolved at READ time, in compute_readiness().
--
-- This migration only (a) captures the hand-run ALTER as a real migration, and
-- (b) indexes for the latest-per-code read. Apply via the CLI per the playbook.

-- 1. Capture the hand-run ALTER (idempotent — no-op against the already-altered DB).
ALTER TABLE readiness_results
  ADD COLUMN IF NOT EXISTS payload text
    CHECK (payload IN ('code-fix','content-asset','product-substance','build-feature')),
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'confirmed'
    CHECK (confidence IN ('confirmed','suspected','tooling')),
  ADD COLUMN IF NOT EXISTS blocks_gate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by text;

-- 2. Index for the DISTINCT ON (check_code) ... ORDER BY check_code, scored_at DESC
--    read pattern the scorer uses. (Per product, newest verdict per code.)
CREATE INDEX IF NOT EXISTS idx_readiness_latest
  ON readiness_results(product_slug, check_code, scored_at DESC);

-- NOTE — deliberately NOT added:
--   * UNIQUE(product_slug, check_code): recordReadiness() appends, never upserts.
--   * FK check_code -> readiness_criteria(code): the writer is dependency-free and
--     does not validate codes against the catalogue; a FK could reject a legitimate
--     append if a code is renamed. The scorer LEFT JOINs the catalogue instead, so an
--     orphan code simply scores as nothing rather than erroring. (Add the FK later as
--     NOT VALID only if you want write-time enforcement and have confirmed no drift.)