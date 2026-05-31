-- supabase/migrations/20260531_readiness_results_findings.sql
--
-- Stage 6 wiring for the punch-list loop. readiness_results IS the punch list;
-- this does NOT create a parallel table.
--
-- IMPORTANT — drift note: the five columns below (payload, confidence, blocks_gate,
-- closed_at, closed_by) were already added by hand in the SQL editor on 2026-05-31.
-- They are re-declared here with IF NOT EXISTS so this file becomes the system of
-- record for that change without failing against the DB where it already ran.
-- Pushing this is a no-op for the columns and only adds the constraints + index.
--
-- Apply via the CLI per SUPABASE_MIGRATION_PLAYBOOK.md (supabase db push).

-- 1. Capture the hand-run ALTER as a real migration (idempotent).
ALTER TABLE readiness_results
  ADD COLUMN IF NOT EXISTS payload text
    CHECK (payload IN ('code-fix','content-asset','product-substance','build-feature')),
  ADD COLUMN IF NOT EXISTS confidence text DEFAULT 'confirmed'
    CHECK (confidence IN ('confirmed','suspected','tooling')),
  ADD COLUMN IF NOT EXISTS blocks_gate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by text;

-- 2. Stable upsert key so a certifier re-run UPDATES a row in place rather than
--    inserting a duplicate. Run history lives in pipeline_gates + validation_events;
--    readiness_results is current-state, one row per (product, check).
--
--    PRE-FLIGHT: if duplicate (product_slug, check_code) rows exist, this ADD will
--    fail. Dedup to latest first:
--      delete from readiness_results r using readiness_results n
--      where r.product_slug = n.product_slug and r.check_code = n.check_code
--        and r.scored_at < n.scored_at;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'readiness_results_product_check_uniq'
  ) THEN
    ALTER TABLE readiness_results
      ADD CONSTRAINT readiness_results_product_check_uniq
      UNIQUE (product_slug, check_code);
  END IF;
END $$;

-- 3. Tie results to the catalogue. check_code must reference a real criterion.
--    NOT VALID = enforce on new writes only, don't reject any historical rows that
--    reference a since-retired code.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'readiness_results_check_code_fk'
  ) THEN
    ALTER TABLE readiness_results
      ADD CONSTRAINT readiness_results_check_code_fk
      FOREIGN KEY (check_code) REFERENCES readiness_criteria(code)
      ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

-- 4. Lifecycle index for open-findings / re-inspection queries.
CREATE INDEX IF NOT EXISTS idx_readiness_open
  ON readiness_results(product_slug, status)
  WHERE status = 'fail';

-- Note: blocks_gate is DERIVED in compute_readiness() from readiness_criteria.tier
-- (see 20260531_readiness_scoring.sql). The stored column is an optional manual
-- override only; the function treats a stored true as a forced block.
