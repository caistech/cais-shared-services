-- Validation Access Requests Table
-- Stores requests from users wanting access to the methodology cockpit
-- Created: 2026-05-26

CREATE TABLE IF NOT EXISTS validation_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, contacted
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  contacted_at TIMESTAMP WITH TIME ZONE,
  contacted_by UUID -- Reference to who contacted them (admin user)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validation_access_requests_status 
  ON validation_access_requests(status);

CREATE INDEX IF NOT EXISTS idx_validation_access_requests_email 
  ON validation_access_requests(email);

CREATE INDEX IF NOT EXISTS idx_validation_access_requests_created_at 
  ON validation_access_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_validation_access_requests_contacted 
  ON validation_access_requests(contacted_at) 
  WHERE contacted_at IS NOT NULL;

-- RLS Policies (public insert only, authenticated read all)
ALTER TABLE validation_access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a request
CREATE POLICY "Anyone can create access requests"
  ON validation_access_requests
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read requests
CREATE POLICY "Authenticated users can read all requests"
  ON validation_access_requests
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only authenticated users can update requests
CREATE POLICY "Authenticated users can update requests"
  ON validation_access_requests
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions
GRANT INSERT ON validation_access_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON validation_access_requests TO authenticated;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_validation_access_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_validation_access_requests_updated_at
  BEFORE UPDATE ON validation_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_validation_access_requests_updated_at();
