-- supabase/migrations/20260531_readiness_scoring.sql
--
-- Tier-aware readiness scoring. Replaces the five hardcoded has_* booleans in the
-- Next routes with the rubric that lives in readiness_criteria (the 63 checks).
--
-- Depends on 20260531_readiness_results_findings.sql (same push). Apply via the CLI.
--
-- Tier semantics (readiness_criteria.tier):
--   HARD                 binary gate. fail => GO blocked, regardless of %.
--   CONDITIONAL-HARD     gate, but only when it applies (na = doesn't apply).
--   WEIGHTED             scored. contributes to % by weight (High/Med/Low).
--   CONDITIONAL-WEIGHTED scored, only when it applies.
--   TOO-MUCH             inverted guard. fail = product is OVER-built pre-GO.
--   DEFER                excluded from gate AND %.
--
-- Status (readiness_results.status): pass | fail | na
--   na      = determined not-applicable -> excluded from the weighted denominator.
--   absent  = no row for a HARD check -> UNVERIFIED -> blocks GO (can't pass a gate
--             you never inspected).

CREATE OR REPLACE FUNCTION compute_readiness(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_weight_num   NUMERIC := 0;
  v_weight_den   NUMERIC := 0;
  v_pct          INTEGER;
  v_hard_fail    TEXT[];
  v_hard_missing TEXT[];
  v_toomuch_fail TEXT[];
  v_override     TEXT[];
  v_gate_open    BOOLEAN;
BEGIN
  WITH scored AS (
    SELECT c.code, c.tier, c.weight,
           CASE lower(coalesce(c.weight,''))
             WHEN 'high' THEN 3 WHEN 'med' THEN 2 WHEN 'low' THEN 1 ELSE 0 END AS pts,
           r.status,
           coalesce(r.blocks_gate, false) AS forced_block
    FROM readiness_criteria c
    LEFT JOIN readiness_results r
      ON r.check_code = c.code AND r.product_slug = p_slug
  )
  SELECT
    coalesce(sum(pts) FILTER (WHERE tier IN ('WEIGHTED','CONDITIONAL-WEIGHTED') AND status = 'pass'), 0),
    coalesce(sum(pts) FILTER (WHERE tier IN ('WEIGHTED','CONDITIONAL-WEIGHTED') AND status IN ('pass','fail')), 0),
    array_agg(code) FILTER (WHERE tier IN ('HARD','CONDITIONAL-HARD') AND status = 'fail'),
    array_agg(code) FILTER (WHERE tier = 'HARD' AND status IS NULL),
    array_agg(code) FILTER (WHERE tier = 'TOO-MUCH' AND status = 'fail'),
    -- manual override: any row flagged blocks_gate that isn't already passing
    array_agg(code) FILTER (WHERE forced_block AND coalesce(status,'') <> 'pass')
  INTO v_weight_num, v_weight_den, v_hard_fail, v_hard_missing, v_toomuch_fail, v_override
  FROM scored;

  v_pct := CASE WHEN v_weight_den = 0 THEN NULL
                ELSE round(100.0 * v_weight_num / v_weight_den) END;

  v_gate_open :=
        coalesce(array_length(v_hard_fail, 1), 0)    = 0
    AND coalesce(array_length(v_hard_missing, 1), 0) = 0
    AND coalesce(array_length(v_toomuch_fail, 1), 0) = 0
    AND coalesce(array_length(v_override, 1), 0)     = 0
    AND v_pct IS NOT NULL
    AND v_pct >= 80;

  RETURN jsonb_build_object(
    'product_slug',     p_slug,
    'weighted_pct',     v_pct,
    'gate_open',        v_gate_open,
    'hard_fails',       coalesce(to_jsonb(v_hard_fail),    '[]'::jsonb),
    'hard_unverified',  coalesce(to_jsonb(v_hard_missing), '[]'::jsonb),
    'too_much',         coalesce(to_jsonb(v_toomuch_fail), '[]'::jsonb),
    'forced_blocks',    coalesce(to_jsonb(v_override),     '[]'::jsonb),
    'computed_at',      now()
  );
END;
$$;

-- One source of truth for the cockpit readiness panel and the InvestorPilot gate.
-- Computed once per row via a lateral join (not 5x per column).
CREATE OR REPLACE VIEW product_gate_status AS
SELECT
  pvs.product_slug,
  (g.j->>'weighted_pct')::int      AS weighted_pct,
  (g.j->>'gate_open')::boolean     AS gate_open,
  g.j->'hard_fails'                AS hard_fails,
  g.j->'hard_unverified'           AS hard_unverified,
  g.j->'too_much'                  AS too_much,
  g.j->'forced_blocks'             AS forced_blocks
FROM product_validation_status pvs
CROSS JOIN LATERAL (SELECT compute_readiness(pvs.product_slug) AS j) g;

-- Examples:
--   select compute_readiness('singify');
--   select * from product_gate_status order by gate_open;
