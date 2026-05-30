-- Pipeline Fix Queue
-- Queues auto-fix tasks for when local machine reconnects or for GitHub Actions

CREATE TABLE IF NOT EXISTS pipeline_fix_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL,
  findings TEXT[] NOT NULL,
  product_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  
  FOREIGN KEY (product_slug) REFERENCES product_validation_status(product_slug)
);

-- Index for pending fixes
CREATE INDEX IF NOT EXISTS idx_pipeline_fix_queue_pending 
  ON pipeline_fix_queue(status, created_at DESC);

-- RLS
ALTER TABLE pipeline_fix_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage fix queue"
  ON pipeline_fix_queue
  FOR ALL
  USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT ON pipeline_fix_queue TO authenticated;
