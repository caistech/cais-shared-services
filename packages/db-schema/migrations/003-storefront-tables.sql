-- Migration 003: Storefront tables for Agent Storefront MCP server
-- Run this against your Supabase project SQL editor
-- Depends on: 002-org-multi-agent.sql
--
-- These tables are GLOBAL (not org-scoped). Providers are public marketplace
-- listings, searchable and bookable by any agent/buyer.
-- storefront-mcp reads providers/services/reviews/availability,
-- writes bookings and availability_holds.

-- ============================================================
-- 1. PROVIDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  abn TEXT,                              -- Australian Business Number
  gst_registered BOOLEAN NOT NULL DEFAULT false,
  qbcc_licence TEXT,                     -- QLD Building & Construction Commission
  insured BOOLEAN NOT NULL DEFAULT false,
  insurance_amount NUMERIC,              -- e.g. 10000000 for $10M
  years_trading INTEGER NOT NULL DEFAULT 0,
  suburb TEXT NOT NULL,
  postcode TEXT NOT NULL,
  state TEXT NOT NULL,                   -- NSW, VIC, QLD, etc.
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km INTEGER NOT NULL DEFAULT 50,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  website TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_providers_active ON providers (active);
CREATE INDEX IF NOT EXISTS idx_providers_postcode ON providers (postcode);
CREATE INDEX IF NOT EXISTS idx_providers_state ON providers (state);

-- ============================================================
-- 2. SERVICES
-- ============================================================

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                -- e.g. "plumbing", "electrical"
  name TEXT NOT NULL,
  description TEXT,
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('fixed', 'range', 'quote_required')),
  price_min NUMERIC,
  price_max NUMERIC,
  currency TEXT NOT NULL DEFAULT 'AUD',
  scope_includes TEXT[] DEFAULT '{}',
  scope_excludes TEXT[] DEFAULT '{}',
  instant_book BOOLEAN NOT NULL DEFAULT false,
  sla_response_hours INTEGER,
  warranty_months INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_provider ON services (provider_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services (category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (provider_id, active);

-- ============================================================
-- 3. REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  rating NUMERIC NOT NULL CHECK (rating >= 0 AND rating <= 5),
  review_text TEXT,
  reviewer_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider ON reviews (provider_id);

-- ============================================================
-- 4. AVAILABILITY (recurring weekly windows)
-- ============================================================

CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0=Sunday
  time_from TEXT NOT NULL,               -- "08:00"
  time_to TEXT NOT NULL,                 -- "17:00"
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_availability_provider ON availability (provider_id, active);

-- ============================================================
-- 5. AVAILABILITY HOLDS (10-min slot locks)
-- ============================================================

CREATE TABLE IF NOT EXISTS availability_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  hold_expires TIMESTAMPTZ NOT NULL,
  booking_id UUID,                       -- NULL until claimed by create_booking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holds_provider_date ON availability_holds (provider_id, date);
CREATE INDEX IF NOT EXISTS idx_holds_expires ON availability_holds (hold_expires) WHERE booking_id IS NULL;

-- ============================================================
-- 6. BOOKINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  buyer_ref TEXT NOT NULL,               -- agent auth identity
  buyer_mode TEXT NOT NULL DEFAULT 'personal' CHECK (buyer_mode IN ('personal', 'business')),
  hold_id UUID REFERENCES availability_holds(id),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_quote', 'pending_approval', 'cancelled')),
  job_notes TEXT,
  requires_quote_confirm BOOLEAN NOT NULL DEFAULT false,
  approval_threshold NUMERIC,
  escalation_required BOOLEAN NOT NULL DEFAULT false,
  date DATE NOT NULL,
  time_from TEXT NOT NULL,
  time_to TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_provider_date ON bookings (provider_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_buyer ON bookings (buyer_ref);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);

-- ============================================================
-- 7. RLS POLICIES — public read, controlled write
-- ============================================================

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Public read on catalog tables (any authenticated or service role)
CREATE POLICY providers_public_read ON providers FOR SELECT USING (true);
CREATE POLICY services_public_read ON services FOR SELECT USING (true);
CREATE POLICY reviews_public_read ON reviews FOR SELECT USING (true);
CREATE POLICY availability_public_read ON availability FOR SELECT USING (true);

-- Holds: anyone can create, read own or service role reads all
CREATE POLICY holds_public_read ON availability_holds FOR SELECT USING (true);
CREATE POLICY holds_public_insert ON availability_holds FOR INSERT WITH CHECK (true);
CREATE POLICY holds_public_update ON availability_holds FOR UPDATE USING (true);

-- Bookings: anyone can create, read filtered by buyer_ref
CREATE POLICY bookings_insert ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY bookings_read ON bookings FOR SELECT USING (true);
CREATE POLICY bookings_update ON bookings FOR UPDATE USING (true);

-- ============================================================
-- 8. UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER providers_updated_at
  BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
