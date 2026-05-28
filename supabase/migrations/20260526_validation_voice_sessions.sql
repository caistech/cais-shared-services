-- Validation Voice Sessions Schema
-- Stores voice conversation transcripts and extracted validation schema suggestions
-- Created: 2026-05-26

-- Create validation_voice_sessions table
CREATE TABLE IF NOT EXISTS validation_voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  transcript JSONB,
  suggested_changes JSONB,
  confidence_scores JSONB,
  applied_changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata for auditing and tracking
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validation_voice_sessions_product_id 
  ON validation_voice_sessions(product_id DESC);

CREATE INDEX IF NOT EXISTS idx_validation_voice_sessions_created_at 
  ON validation_voice_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_voice_sessions_session_id 
  ON validation_voice_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_validation_voice_sessions_accepted 
  ON validation_voice_sessions(accepted_at) 
  WHERE accepted_at IS NOT NULL;

-- Create table for tracking which suggestions were applied to products
CREATE TABLE IF NOT EXISTS validation_applied_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES validation_voice_sessions(session_id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  applied_by UUID,
  
  UNIQUE(session_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_validation_applied_suggestions_session_id 
  ON validation_applied_suggestions(session_id);

CREATE INDEX IF NOT EXISTS idx_validation_applied_suggestions_applied_by 
  ON validation_applied_suggestions(applied_by);

-- RLS Policies
ALTER TABLE validation_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_applied_suggestions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own product's validation sessions
CREATE POLICY "Users can read validation sessions for their products"
  ON validation_voice_sessions
  FOR SELECT
  USING (
    -- In a real scenario, this would check if the user is an admin/owner of the product
    -- For now, allow all authenticated users
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to create validation sessions
CREATE POLICY "Users can create validation sessions"
  ON validation_voice_sessions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow users to update sessions they created
CREATE POLICY "Users can update their own validation sessions"
  ON validation_voice_sessions
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Similar policies for applied_suggestions
CREATE POLICY "Users can read applied suggestions"
  ON validation_applied_suggestions
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create applied suggestions"
  ON validation_applied_suggestions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON validation_voice_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON validation_applied_suggestions TO authenticated;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_validation_voice_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validation_voice_sessions_updated_at
  BEFORE UPDATE ON validation_voice_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_voice_sessions_updated_at();
