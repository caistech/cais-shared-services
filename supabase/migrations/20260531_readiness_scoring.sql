-- supabase/migrations/20260531_readiness_scoring.sql
--
-- Tier-aware readiness scoring, DEPLOYMENT-SCOPED (Delta 2) with a transition rule,
-- returning a SELF-EXPLAINING blocker list (what / why / who / status).
--
-- Writer is append-only (gate-check.mjs recordReadiness) -> scorer reads latest per
-- check_code. recordReadiness binds deployment_id only when the caller passes one, so
-- historical verdicts may be null-bound; the binding rule handles that.
--
-- Signature: compute_readiness(p_slug, p_live_deployment text default null)
--   p_live_deployment = the deployment id production is serving NOW. NULL -> latest-wins.
--
-- Binding per latest verdict:
--   verified : bound to p_live_deployment      -> counts, current
--   unbound  : deployment_id IS NULL           -> counts, flagged provisional
--   stale    : bound to a DIFFERENT deployment -> does NOT count; re-audit needed
--
-- Tiers: HARD / CONDITIONAL-HARD gate; WEIGHTED / CONDITIONAL-WEIGHTED -> %;
--        TOO-MUCH inverted guard; DEFER excluded.  Status: pass | fail | na.

DROP FUNCTION IF EXISTS compute_readiness(text);

CREATE OR REPLACE FUNCTION compute_readiness(p_slug TEXT, p_live_deployment TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_pct         INTEGER;
  v_num         NUMERIC := 0;
  v_den         NUMERIC := 0;
  v_blockers    JSONB := '[]'::jsonb;
  v_provisional JSONB := '[]'::jsonb;
  v_gate_open   BOOLEAN;
BEGIN
  -- Build the scored set ONCE into a temp table (CTEs only live for one statement).
  -- is_blocker is computed here so blockers and provisional never double-list a code.
  DROP TABLE IF EXISTS _scored;
  CREATE TEMP TABLE _scored ON COMMIT DROP AS
  WITH latest AS (
    SELECT DISTINCT ON (check_code)
           check_code, status, coalesce(blocks_gate,false) AS blocks_gate,
           deployment_id, evidence, payload, closed_by
    FROM readiness_results
    WHERE product_slug = p_slug
    ORDER BY check_code, scored_at DESC
  ),
  bound AS (
    SELECT l.*,
           CASE
             WHEN l.deployment_id IS NULL             THEN 'unbound'
             WHEN p_live_deployment IS NULL           THEN 'unbound'
             WHEN l.deployment_id = p_live_deployment THEN 'verified'
             ELSE 'stale'
           END AS binding
    FROM latest l
  ),
  enriched AS (
    SELECT c.code, c.tier, c.check_label,
           CASE lower(coalesce(c.weight,''))
             WHEN 'high' THEN 3 WHEN 'med' THEN 2 WHEN 'low' THEN 1 ELSE 0 END AS pts,
           b.status, b.binding, coalesce(b.blocks_gate,false) AS forced_block,
           b.evidence, b.payload, b.closed_by,
           CASE WHEN b.binding = 'stale' THEN NULL ELSE b.status END AS eff_status
    FROM readiness_criteria c
    LEFT JOIN bound b ON b.check_code = c.code
  )
  SELECT *,
    CASE WHEN
      (tier IN ('HARD','CONDITIONAL-HARD') AND (eff_status = 'fail' OR (tier='HARD' AND eff_status IS NULL)))
      OR (tier = 'TOO-MUCH' AND eff_status = 'fail')
      OR (forced_block AND coalesce(eff_status,'') <> 'pass')
    THEN true ELSE false END AS is_blocker
  FROM enriched;

  -- weighted %: WEIGHTED + applicable COND-WEIGHTED, pass/fail only (na & stale excluded)
  SELECT
    coalesce(sum(pts) FILTER (WHERE tier IN ('WEIGHTED','CONDITIONAL-WEIGHTED') AND eff_status = 'pass'), 0),
    coalesce(sum(pts) FILTER (WHERE tier IN ('WEIGHTED','CONDITIONAL-WEIGHTED') AND eff_status IN ('pass','fail')), 0)
  INTO v_num, v_den
  FROM _scored;

  v_pct := CASE WHEN v_den = 0 THEN NULL ELSE round(100.0 * v_num / v_den) END;

  -- BLOCKERS: self-explaining (what / why / who / status), hardest tier first.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'label', check_label, 'tier', tier,
           'why_blocking', why, 'lane', lane, 'status', fix_status,
           'binding', binding, 'evidence', evidence
         ) ORDER BY sort_rank), '[]'::jsonb)
  INTO v_blockers
  FROM (
    SELECT code, check_label, tier, evidence, binding,
      CASE
        WHEN tier IN ('HARD','CONDITIONAL-HARD') AND eff_status = 'fail' THEN 'hard gate failed'
        WHEN tier = 'HARD' AND eff_status IS NULL                        THEN 'hard gate never verified on the live build'
        WHEN tier = 'TOO-MUCH' AND eff_status = 'fail'                   THEN 'over-built before GO (scale-infra present too early)'
        WHEN forced_block AND coalesce(eff_status,'') <> 'pass'          THEN 'manually flagged as gate-blocking'
      END AS why,
      CASE
        WHEN closed_by IS NOT NULL THEN 'fixed -- ' || closed_by
        WHEN binding = 'stale'     THEN 're-audit needed (verified on a replaced build)'
        WHEN eff_status = 'fail'   THEN 'open'
        WHEN eff_status IS NULL    THEN 'not yet inspected'
        ELSE 'open'
      END AS fix_status,
      coalesce(payload, 'opencode') AS lane,
      CASE tier WHEN 'HARD' THEN 0 WHEN 'CONDITIONAL-HARD' THEN 1 WHEN 'TOO-MUCH' THEN 2 ELSE 3 END AS sort_rank
    FROM _scored
    WHERE is_blocker
  ) blk;

  -- PROVISIONAL: counted but not confirmed against the live build, and NOT already a
  -- blocker (so nothing is listed twice).
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'code', code, 'label', check_label, 'status', eff_status
         )), '[]'::jsonb)
  INTO v_provisional
  FROM _scored
  WHERE binding = 'unbound' AND eff_status IS NOT NULL AND NOT is_blocker;

  v_gate_open := (jsonb_array_length(v_blockers) = 0) AND v_pct IS NOT NULL AND v_pct >= 80;

  DROP TABLE IF EXISTS _scored;

  RETURN jsonb_build_object(
    'product_slug',    p_slug,
    'live_deployment', p_live_deployment,
    'weighted_pct',    v_pct,
    'gate_open',       v_gate_open,
    'blockers',        v_blockers,
    'provisional',     v_provisional,
    'computed_at',     now()
  );
END;
$$;

DROP VIEW IF EXISTS product_gate_status;
CREATE VIEW product_gate_status AS
SELECT
  pvs.product_slug,
  (g.j->>'weighted_pct')::int  AS weighted_pct,
  (g.j->>'gate_open')::boolean AS gate_open,
  g.j->'blockers'              AS blockers,
  g.j->'provisional'           AS provisional
FROM product_validation_status pvs
CROSS JOIN LATERAL (SELECT compute_readiness(pvs.product_slug, NULL) AS j) g;

-- select compute_readiness('singify');
-- select compute_readiness('sayfix', 'dpl_LIVE_ID');
-- select * from product_gate_status order by gate_open;