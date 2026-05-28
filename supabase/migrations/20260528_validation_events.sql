-- Validation Events Audit Trail
-- Tracks every change to product validation status for audit + replay capability
-- Created: 2026-05-28
-- Purpose: "Who changed what, when, and why?" — full history

CREATE TABLE IF NOT EXISTS validation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event identity
  product_slug TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'field_updated' | 'status_changed' | 'score_calculated' | 'outreach_run' | 'commitment_added'
  
  -- What changed
  field_name TEXT,           -- Which field was updated? (e.g., 'promise', 'gate1_ready', 'weighted_score_percent')
  old_value TEXT,            -- Previous value (serialized as JSON for complex types)
  new_value TEXT,            -- New value
  
  -- Who made the change
  actor_type TEXT NOT NULL,  -- 'admin' | 'script' | 'system'
  actor_id UUID,             -- Which admin/script? (nullable for system events)
  actor_name TEXT,           -- Human-readable actor name
  
  -- Why it changed
  reason TEXT,               -- What prompted this? ("User submitted form", "Daily scoring run", "Manual gate override", etc.)
  
  -- Context
  context_data JSONB,        -- Extra context (e.g., which validation_events triggered a gate flip)
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip_address TEXT,           -- If from web UI, IP of requester
  user_agent TEXT            -- Browser user agent (if from UI)
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_validation_events_product_slug 
  ON validation_events(product_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_events_event_type 
  ON validation_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_events_actor 
  ON validation_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_events_created 
  ON validation_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_events_field 
  ON validation_events(product_slug, field_name, created_at DESC);

-- RLS Policies
ALTER TABLE validation_events ENABLE ROW LEVEL SECURITY;

-- Admin-only read
CREATE POLICY "Admin can read validation events"
  ON validation_events
  FOR SELECT
  USING (auth.role() = 'authenticated');  -- Gated by middleware to admin emails

-- Only scripts/system can insert (not direct admin inserts)
CREATE POLICY "System can insert validation events"
  ON validation_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON validation_events TO authenticated;
GRANT INSERT ON validation_events TO service_role;

-- Helper function to log events (called from product_validation_status update triggers)
CREATE OR REPLACE FUNCTION log_validation_event(
  p_product_slug TEXT,
  p_event_type TEXT,
  p_field_name TEXT DEFAULT NULL,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_context_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_actor_id UUID;
  v_actor_name TEXT;
  v_actor_type TEXT;
BEGIN
  -- Determine who/what is making the change
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    -- System/script call
    v_actor_type := 'system';
    v_actor_name := 'system';
  ELSE
    v_actor_type := 'admin';
    v_actor_name := (SELECT email FROM auth.users WHERE id = v_actor_id LIMIT 1);
  END IF;
  
  -- Insert event
  INSERT INTO validation_events (
    product_slug,
    event_type,
    field_name,
    old_value,
    new_value,
    actor_type,
    actor_id,
    actor_name,
    reason,
    context_data
  )
  VALUES (
    p_product_slug,
    p_event_type,
    p_field_name,
    p_old_value,
    p_new_value,
    v_actor_type,
    v_actor_id,
    v_actor_name,
    p_reason,
    p_context_data
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow authenticated users to call the logging function (security_definer runs as definer)
GRANT EXECUTE ON FUNCTION log_validation_event TO authenticated, service_role;
