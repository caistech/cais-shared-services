-- Feasibility context layer for product_validation_status
-- Created: 2026-06-04
-- Purpose: store the Stage-1 feasibility tier captured at onboarding (the 7-node
--          chain's non-graded outputs). This tier is DELIBERATELY separate from the
--          14 graded validation fields: it is the admission gate + build/outreach
--          context, and is NEVER seen by survey / certify / score.
--
-- Shape of the `feasibility` JSONB (all keys optional until admission):
--   {
--     "proof_of_demand":          text,   -- node 2: evidence the END USERS will love it
--     "demand_tier":              enum,    -- intuition | anecdote | article | data | traction
--     "why_now":                  text,    -- node 2: timing / urgency
--     "status_quo":               text,    -- node 5: what people do today instead
--     "product_type":             text,    -- node 6: SaaS | custom | internal | infra | white-label (context only)
--     "distributor_benefit_mode": enum     -- node 7(b): paid | value-add
--   }
--
-- demand_tier ordering (for later scoring; not enforced here):
--   intuition < anecdote < article < data < traction
-- Admission rule (enforced at the write path, not in SQL): proof_of_demand present
--   (any tier) is a HARD gate; the 14 graded fields at their robustness bars; the
--   distributor relationship coherent (end-user love -> distributor confidence + benefit).

ALTER TABLE product_validation_status
  ADD COLUMN IF NOT EXISTS feasibility JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN product_validation_status.feasibility IS
  'Stage-1 feasibility context (7-node chain non-graded outputs): proof_of_demand, demand_tier, why_now, status_quo, product_type, distributor_benefit_mode. Admission gate + build/outreach context. NEVER scored by survey/certify/score.';

-- Enforce the two enum-valued keys when present (legible failure on bad writes).
-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres, so guard for re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feasibility_demand_tier_valid'
  ) THEN
    ALTER TABLE product_validation_status
      ADD CONSTRAINT feasibility_demand_tier_valid CHECK (
        feasibility->>'demand_tier' IS NULL
        OR feasibility->>'demand_tier' IN ('intuition','anecdote','article','data','traction')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feasibility_benefit_mode_valid'
  ) THEN
    ALTER TABLE product_validation_status
      ADD CONSTRAINT feasibility_benefit_mode_valid CHECK (
        feasibility->>'distributor_benefit_mode' IS NULL
        OR feasibility->>'distributor_benefit_mode' IN ('paid','value-add')
      );
  END IF;
END $$;

-- Partial index to find ideas that already cleared the hard proof gate (cheap admission query).
CREATE INDEX IF NOT EXISTS idx_pvs_feasibility_has_proof
  ON product_validation_status ((feasibility->>'proof_of_demand'))
  WHERE feasibility->>'proof_of_demand' IS NOT NULL;
