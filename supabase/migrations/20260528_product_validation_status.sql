-- Product Validation Status Table
-- Tracks validation pipeline readiness for all portfolio products
-- Created: 2026-05-28
-- Purpose: Answer "Which products can run outreach RIGHT NOW?" and "What gaps exist?"

CREATE TABLE IF NOT EXISTS product_validation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product identity (matches portfolio-manifest.yaml slug)
  product_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  
  -- Validation Readiness (gates from BUSINESS_MODEL §4)
  -- Gate 1: Idea → Feasibility → Dual-stream validation → GO/NO-GO → Ship MVP
  gate1_ready BOOLEAN DEFAULT false,
  gate1_score_percent INT CHECK (gate1_score_percent BETWEEN 0 AND 100),
  
  -- Hard Gates (must-haves for validation pipeline)
  hard_gates_passed INT DEFAULT 0,           -- Number of hard gates passed
  hard_gates_total INT DEFAULT 6,             -- Total hard gates (6 per BUSINESS_MODEL)
  
  -- Weighted Score (blended across hard + soft gates)
  weighted_score_percent INT CHECK (weighted_score_percent BETWEEN 0 AND 100),
  
  -- Outreach Readiness (can this product run outreach RIGHT NOW?)
  can_run_outreach BOOLEAN DEFAULT false,      -- True if gate1_ready AND all required fields present
  outreach_blocker TEXT,                        -- If not ready, what's stopping it? (e.g., "missing promise", "no distributor hypothesis")
  
  -- Product Details (from portfolio-manifest.yaml enrichment)
  promise TEXT,                                 -- What problem does it solve? (1-2 sentences)
  distributor TEXT,                             -- Who sells/distributes it?
  end_user TEXT,                                -- Who uses it?
  friction TEXT,                                -- What pain point does it address?
  
  -- Validation Fields Status (checklist for pipeline readiness)
  has_promise BOOLEAN DEFAULT false,
  has_distributor BOOLEAN DEFAULT false,
  has_end_user BOOLEAN DEFAULT false,
  has_friction BOOLEAN DEFAULT false,
  has_methodology_commitment BOOLEAN DEFAULT false,  -- Did the founder commit to validate via the pipeline?
  
  -- Recent Activity
  last_validation_update TIMESTAMP WITH TIME ZONE,
  last_outreach_attempt TIMESTAMP WITH TIME ZONE,
  last_scoring_run TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID,  -- Which admin/script updated it
  
  -- Metadata
  notes TEXT,  -- Admin notes about this product's pipeline status
  is_draft BOOLEAN DEFAULT true,  -- True if in early ideation, not yet committed to pipeline
  is_paused BOOLEAN DEFAULT false  -- True if temporarily paused (funding hold, pivot, etc)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_product_validation_status_gate1_ready 
  ON product_validation_status(gate1_ready, can_run_outreach DESC);

CREATE INDEX IF NOT EXISTS idx_product_validation_status_can_run_outreach 
  ON product_validation_status(can_run_outreach DESC);

CREATE INDEX IF NOT EXISTS idx_product_validation_status_score 
  ON product_validation_status(weighted_score_percent DESC);

CREATE INDEX IF NOT EXISTS idx_product_validation_status_updated 
  ON product_validation_status(last_scoring_run DESC);

CREATE INDEX IF NOT EXISTS idx_product_validation_status_product_slug 
  ON product_validation_status(product_slug);

-- RLS Policies
ALTER TABLE product_validation_status ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admin can read validation status"
  ON product_validation_status
  FOR SELECT
  USING (auth.role() = 'authenticated');  -- Gated by middleware to admin emails

-- Admin-only write
CREATE POLICY "Admin can update validation status"
  ON product_validation_status
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin can insert validation status"
  ON product_validation_status
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON product_validation_status TO authenticated;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_product_validation_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_validation_status_updated_at
  BEFORE UPDATE ON product_validation_status
  FOR EACH ROW
  EXECUTE FUNCTION update_product_validation_status_updated_at();
