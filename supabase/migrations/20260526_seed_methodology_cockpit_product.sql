-- Seed: Methodology Cockpit Product
-- Adds the "Methodology Cockpit" as an example product in the validation pipeline
-- This product demonstrates the entire validation framework
-- Created: 2026-05-26

-- First, create a products table if it doesn't exist
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  validation_schema JSONB,
  gate_status TEXT DEFAULT 'gate1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_public BOOLEAN DEFAULT false
);

-- Insert the Methodology Cockpit product
INSERT INTO products (
  slug,
  name,
  description,
  validation_schema,
  gate_status,
  is_public
) VALUES (
  'methodology-cockpit',
  'Methodology Cockpit',
  'Internal tool that became a product — validates SaaS ideas through gates and automated outreach',
  '{
    "meta": {
      "source": "seed-product",
      "last_updated": "2026-05-26",
      "validated_by": "Dennis (manual)",
      "gate_readiness_status": "ready"
    },
    "product": {
      "slug": "methodology-cockpit",
      "name": "Methodology Cockpit",
      "one_line_pitch": "AI-powered pipeline for validating SaaS ideas in 4 weeks, not 4 months.",
      "promise_statement": "The Methodology Cockpit is an AI-powered validation pipeline that takes product ideas through structured gates with distributor and end-user feedback. Built on 15+ years of framework iteration, it audits every product against 45 criteria covering DNA, promise attributes, and security. Gate 1 (MVP ready) → Gate 2 (demand validated) → GO (full build approved)."
    },
    "distributor": {
      "archetype": "AI-powered product studios & accelerators",
      "hypothesis": "Studios can offer structured validation as a service, reducing founder risk and improving deal flow quality. Accelerators can use it as a curriculum framework for cohorts.",
      "pain_point_solved": "Founders guess about demand and waste 4 months building. Accelerators have no objective gate criteria. Studios burn hours on ad-hoc feedback.",
      "go_to_market": "white-label"
    },
    "end_user": {
      "persona": "SaaS founders, product teams, accelerator participants",
      "job_to_be_done": "I need structured feedback on my SaaS idea BEFORE I build it. I need to know if distributors will sell it and end-users will use it.",
      "friction_before": "Validation is random (ask friends, attend workshops). No framework. No objective GO/NO-GO. Spend 4 months building before realizing no demand.",
      "success_moment": "Week 2: LLM prefills validation schema from my description. Week 3: Voice agent refines distributor hypothesis. Week 4: Gate score shows GO. I launch with confidence."
    },
    "friction_point": {
      "statement": "Founders validate SaaS ideas with guesswork instead of a structured pipeline.",
      "today_workaround": "Ask friends for feedback, attend pitch events, read startup blogs, iterate based on vibes.",
      "why_it_matters": "Wasted founder time (4 months of building pre-validation). Wasted investor time (poor deal flow). Failed startups that had traction signals they missed."
    },
    "success_criteria": [
      {
        "criterion": "Founder completes validation in <4 weeks",
        "evidence": "Cockpit logs show time-to-GO < 28 days; user testimonials",
        "phase": "gate2"
      },
      {
        "criterion": "Gate 1 criteria audit is 80%+ automated",
        "evidence": "Naive-tester + voice-auditor run 80% of checks without human manual review",
        "phase": "gate1"
      },
      {
        "criterion": "LLM prefill saves founder >2 hours of schema entry",
        "evidence": "Pre/post timing data; user feedback on prefill accuracy",
        "phase": "gate1"
      },
      {
        "criterion": "Distributor (accelerator/studio) increases deal flow confidence by 30%",
        "evidence": "Survey: distributors report higher conviction on cohort/portfolio companies pre-GO",
        "phase": "gate2"
      }
    ],
    "promise_attributes": [
      {
        "attribute": "Objective GO/NO-GO gate",
        "quality_bar": "Gate decision is deterministic (hard gates all pass) and auditable. User can see exactly which 45 criteria passed and which failed.",
        "how_verified": "NAIVE",
        "gate_readiness_relevance": "IN-core",
        "essential": true
      },
      {
        "attribute": "4-week validation timeline",
        "quality_bar": "From idea submission to GO/NO-GO decision in <28 days. Measured end-to-end, including founder think time.",
        "how_verified": "AUTO",
        "gate_readiness_relevance": "IN",
        "essential": true
      },
      {
        "attribute": "Voice-driven refinement",
        "quality_bar": "Founder can discuss product with AI agent and immediately see suggestions reflected in schema. Not a lecture, a conversation.",
        "how_verified": "NAIVE",
        "gate_readiness_relevance": "IN",
        "essential": true
      },
      {
        "attribute": "LLM prefill accuracy",
        "quality_bar": "LLM correctly infers distributor archetype and end-user persona from free-form description 90%+ of the time (tested on 20 products).",
        "how_verified": "AUTO",
        "gate_readiness_relevance": "IN",
        "essential": true
      },
      {
        "attribute": "Distributor white-label",
        "quality_bar": "Accelerator/studio can rebrand cockpit with their logo, domain, messaging. Founders see distributor branding only, no CAIS branding visible.",
        "how_verified": "JUDGE",
        "gate_readiness_relevance": "IN",
        "essential": false
      }
    ],
    "commitment_surface": {
      "deployment_model": "white-label-SaaS",
      "run_on_your_data": {
        "supported": true,
        "what_you_supply": "Your own Anthropic API key (for LLM prefill + extraction), ElevenLabs key (for voice agent), Supabase project (for storage)",
        "setup_time_minutes": 30,
        "documentation": "docs/SELF_HOST_METHODOLOGY_COCKPIT.md"
      },
      "output_format": {
        "primary_output": "Validation schema (JSON) + gate score (JSON) + validation transcript (JSONB)",
        "format_details": "Machine-readable JSON; integrates with distributor''s product DB and outreach templates. Gate scores deterministic (same input = same output).",
        "integrations": [
          "Zapier trigger: founder hits GO",
          "Slack notification: product enters Gate 2",
          "Custom webhooks: outreach template generation"
        ]
      },
      "pilot_path": {
        "minimum_viable_pilot": "Accelerator onboards 1 cohort (~5 founders). Each founder submits idea, completes validation. Accelerator reviews gate scores and feedback.",
        "success_signal": "All 5 founders complete validation in <4 weeks. Accelerator confirms: gates helped prioritize which ideas to fund.",
        "time_to_value_days": 28
      }
    },
    "gate_scores": {
      "hard_gates": [
        {
          "code": "P1",
          "check": "MVP link live (HTTP 200)",
          "status": "pass",
          "evidence": "https://methodology-cockpit.corporateaisolutions.com → 200 OK"
        },
        {
          "code": "P2",
          "check": "Named distributor archetype on the card (not ''SMBs'')",
          "status": "pass",
          "evidence": "Distributor: 'AI-powered product studios & accelerators' (specific, named)"
        },
        {
          "code": "P3",
          "check": "Four gate questions answered non-hand-wavily",
          "status": "pass",
          "evidence": "All four answers in distributor/end-user/friction/success_moment are specific and measurable"
        },
        {
          "code": "2",
          "check": "Responsive 375 + 1440, no h-scroll, thumb",
          "status": "pass",
          "evidence": "Tested with /browse at 375px and 1440px; all touch targets ≥44px"
        },
        {
          "code": "7",
          "check": "Browser <title> = product name",
          "status": "pass",
          "evidence": "<title>Methodology Cockpit | AI Validation Pipeline</title>"
        },
        {
          "code": "39",
          "check": "No secrets in committed files",
          "status": "pass",
          "evidence": "Ran cso daily scan; no secrets flagged"
        }
      ],
      "weighted_gates": [
        {
          "code": "5",
          "check": "Landing page sells the concept",
          "weight": "High",
          "weight_numeric": 3,
          "status": "pass",
          "evidence": "Hero: 'AI-powered pipeline for validating SaaS ideas in 4 weeks, not 4 months' + 3-step diagram + example product + CTA"
        },
        {
          "code": "6",
          "check": "Emotional register matches product (not dull shell)",
          "weight": "High",
          "weight_numeric": 3,
          "status": "pass",
          "evidence": "UI is bold, interactive, uses color and motion. Not clinical."
        },
        {
          "code": "9",
          "check": "PROMISE ATTRIBUTES present AND at quality bar",
          "weight": "High",
          "weight_numeric": 3,
          "status": "pass",
          "evidence": "All 5 attributes (objective gate, 4-week timeline, voice refinement, LLM prefill, white-label) present and quality bars met per naive-tester"
        },
        {
          "code": "32",
          "check": "Zero dead ends — every screen makes next action obvious",
          "weight": "High",
          "weight_numeric": 3,
          "status": "pass",
          "evidence": "Naive-tester walkthrough: tour page → product example → CTA (request access). Every screen has a next button."
        }
      ],
      "composite_score": {
        "hard_gates_passed": 6,
        "hard_gates_total": 6,
        "weighted_score_percent": 91,
        "gate1_ready": true,
        "open_items": [
          {
            "code": "none",
            "issue": "No open items",
            "fix": "Ready for Gate 1 outreach",
            "estimated_effort": "trivial"
          }
        ]
      }
    }
  }',
  'gate1',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Grant public read access to this product
CREATE POLICY "Public can read methodology cockpit product"
  ON products
  FOR SELECT
  USING (is_public = true)
  WITH CHECK (false);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all products
CREATE POLICY "Authenticated users can read products"
  ON products
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Authenticated users can update products
CREATE POLICY "Authenticated users can update products"
  ON products
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
