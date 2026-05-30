-- Add mvp_url column to product_validation_status
-- Required for pipeline cockpit to store deployed MVP URLs

ALTER TABLE product_validation_status ADD COLUMN IF NOT EXISTS mvp_url TEXT;

COMMENT ON COLUMN product_validation_status.mvp_url IS 'Deployed MVP URL for testing';
