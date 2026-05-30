-- Add phase_results column to product_validation_status
-- Stores per-phase test results: { phaseId: { status, tested_at, findings[] } }

ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS phase_results JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN product_validation_status.phase_results IS 'Per-phase test results: { phaseId: { status: passed|failed|warning|not_run, tested_at: timestamp, findings: string[] } }';
