// product-factory/pipeline-cockpit/src/lib/readiness.ts
//
// Single source of truth for the cockpit's stored score. Replaces the inline
// five-boolean SCORE_WEIGHTS math in run-test/route.ts, validation/route.ts, and
// phase/route.ts with a call to the DB function compute_readiness(), so the cockpit
// shows the SAME number the gate enforces.
//
// compute_readiness is deployment-scoped; we pass NULL here (latest-wins fallback)
// because the cockpit's stored summary score is the at-a-glance number. The STRICT
// deployment-bound check happens at the real gate (gate-check.mjs url-share-allowed
// and the certifier flow), which resolves the live deployment id.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Readiness {
  product_slug: string
  weighted_pct: number | null
  gate_open: boolean
  blockers: Array<{
    code: string; label: string; tier: string;
    why_blocking: string; lane: string; status: string;
    binding: string | null; evidence: string | null;
  }>
  provisional: Array<{ code: string; label: string; status: string }>
  computed_at: string
}

/** Compute readiness for a product via the DB function. */
export async function getReadiness(
  supabase: SupabaseClient,
  productSlug: string,
  liveDeployment: string | null = null,
): Promise<Readiness | null> {
  const { data, error } = await supabase.rpc('compute_readiness', {
    p_slug: productSlug,
    p_live_deployment: liveDeployment,
  })
  if (error) { console.error('compute_readiness rpc failed:', error); return null }
  return data as Readiness
}

/**
 * Recompute and persist the cockpit's summary score for a product.
 * Writes weighted_score_percent (the at-a-glance number the UI reads today) plus
 * last_scoring_run. Returns the full Readiness so callers can surface blockers.
 */
export async function recomputeAndStore(
  supabase: SupabaseClient,
  productSlug: string,
  liveDeployment: string | null = null,
): Promise<Readiness | null> {
  const r = await getReadiness(supabase, productSlug, liveDeployment)
  if (!r) return null
  await supabase
    .from('product_validation_status')
    .update({
      weighted_score_percent: r.weighted_pct ?? 0,
      last_scoring_run: new Date().toISOString(),
    })
    .eq('product_slug', productSlug)
  return r
}