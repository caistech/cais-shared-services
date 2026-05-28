-- product-factory/migrations/002_product_factory_7stage.sql
-- 
-- 7-Stage House-Building Lifecycle Tables
-- Stage 5: Certificate of Occupancy
-- Stage 7: Smart Sensors Phase 1
--
-- Run: supabase db push or paste into SQL editor

-- =====================================================
-- TABLE: certificate_of_occupancy
-- Stage 5: Certification & Sign-off
-- =====================================================

CREATE TABLE IF NOT EXISTS certificate_of_occupancy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  sign_off_authority TEXT NOT NULL DEFAULT 'auto',
  readiness_score INTEGER NOT NULL CHECK (readiness_score >= 0 AND readiness_score <= 100),
  trade_certificates JSONB NOT NULL DEFAULT '{}',
  gate_results JSONB NOT NULL DEFAULT '{}',
  product_validation_status TEXT NOT NULL CHECK (product_validation_status IN ('passed', 'warning', 'failed')),
  last_user_checkin TIMESTAMPTZ,
  user_feedback_flag TEXT NOT NULL DEFAULT 'pending_review' CHECK (user_feedback_flag IN ('no_issues', 'issues_reported', 'pending_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE certificate_of_occupancy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything" ON certificate_of_occupancy
  FOR ALL USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_certificate_product_slug ON certificate_of_occupancy(product_slug);
CREATE INDEX IF NOT EXISTS idx_certificate_valid_until ON certificate_of_occupancy(valid_until);

-- =====================================================
-- TABLE: smart_sensors
-- Stage 7: Operations & Maintenance (Phase 1)
-- =====================================================

CREATE TABLE IF NOT EXISTS smart_sensors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL,
  sensor_type TEXT NOT NULL CHECK (sensor_type IN ('health', 'security', 'cost')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'down', 'over_budget')),
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE smart_sensors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything" ON smart_sensors
  FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sensors_product_slug ON smart_sensors(product_slug);
CREATE INDEX IF NOT EXISTS idx_sensors_type ON smart_sensors(sensor_type);
CREATE INDEX IF NOT EXISTS idx_sensors_checked_at ON smart_sensors(checked_at DESC);

-- =====================================================
-- TABLE: product_lifecycle_stage
-- Track current stage in 7-stage lifecycle
-- =====================================================

CREATE TABLE IF NOT EXISTS product_lifecycle_stage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL UNIQUE,
  current_stage INTEGER NOT NULL CHECK (current_stage >= 0 AND current_stage <= 7),
  stage_name TEXT NOT NULL,
  entered_stage_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE product_lifecycle_stage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything" ON product_lifecycle_stage
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lifecycle_product_slug ON product_lifecycle_stage(product_slug);

-- =====================================================
-- TABLE: handover_packages
-- Stage 6: Handover & Launch
-- =====================================================

CREATE TABLE IF NOT EXISTS handover_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug TEXT NOT NULL UNIQUE,
  package_path TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  certificate_of_occupancy_id UUID REFERENCES certificate_of_occupancy(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'delivered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE handover_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything" ON handover_packages
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- FUNCTION: auto_reset_certificate
-- Called by cron job every 30 days
-- =====================================================

CREATE OR REPLACE FUNCTION auto_reset_certificate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cert RECORD;
  days_until_expiry INTEGER;
BEGIN
  FOR cert IN 
    SELECT id, product_slug, valid_until, user_feedback_flag 
    FROM certificate_of_occupancy 
    WHERE valid_until <= NOW() + INTERVAL '7 days'
  LOOP
    days_until_expiry := EXTRACT(EPOCH FROM (cert.valid_until - NOW())) / 86400;
    
    IF days_until_expiry <= 0 THEN
      -- Certificate expired
      IF cert.user_feedback_flag = 'no_issues' THEN
        -- Auto-renew
        UPDATE certificate_of_occupancy
        SET valid_until = NOW() + INTERVAL '30 days',
            issued_at = NOW(),
            last_user_checkin = NOW(),
            sign_off_authority = 'auto',
            updated_at = NOW()
        WHERE id = cert.id;
        
        RAISE NOTICE 'Auto-renewed certificate for %', cert.product_slug;
      ELSIF cert.user_feedback_flag = 'issues_reported' THEN
        RAISE NOTICE 'Certificate for % requires human review (issues reported)', cert.product_slug;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- =====================================================
-- VIEW: product_factory_dashboard
-- Unified view for pipeline dashboard
-- =====================================================

CREATE OR REPLACE VIEW product_factory_dashboard AS
SELECT 
  pvs.product_slug,
  pvs.display_name,
  pvs.validation_test_status,
  pvs.weighted_score_percent as readiness_score,
  pvs.is_draft,
  pvs.is_paused,
  pls.current_stage,
  pls.stage_name,
  coo.valid_until as certificate_valid_until,
  coo.user_feedback_flag as certificate_feedback,
  coo.product_validation_status as certificate_status,
  (SELECT status FROM smart_sensors WHERE product_slug = pvs.product_slug AND sensor_type = 'health' ORDER BY checked_at DESC LIMIT 1) as sensor_health,
  (SELECT status FROM smart_sensors WHERE product_slug = pvs.product_slug AND sensor_type = 'security' ORDER BY checked_at DESC LIMIT 1) as sensor_security,
  (SELECT status FROM smart_sensors WHERE product_slug = pvs.product_slug AND sensor_type = 'cost' ORDER BY checked_at DESC LIMIT 1) as sensor_cost,
  pvs.last_scoring_run
FROM product_validation_status pvs
LEFT JOIN product_lifecycle_stage pls ON pls.product_slug = pvs.product_slug
LEFT JOIN certificate_of_occupancy coo ON coo.product_slug = pvs.product_slug;

-- =====================================================
-- SEQUENCE: for manual certificate IDs if needed
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS certificate_id_seq;
