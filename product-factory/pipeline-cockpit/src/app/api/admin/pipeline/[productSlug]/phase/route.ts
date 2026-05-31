// product-factory/pipeline-cockpit/src/app/api/admin/pipeline/[productSlug]/phase/route.ts
//
// REWRITE of the original. The original let the UI PATCH a phase to {status:'passed'}
// and, on pass, wiped findings to []. That is a builder self-issuing their own
// occupancy certificate.
//
// New behaviour: a phase passing is DERIVED, not asserted. A phase is 'passed' only
// when it has zero open gate-blocking findings. The UI can no longer set 'passed'
// directly; it can only request a recompute (after a certifier re-run has ingested
// fresh findings via /findings).

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCORE_WEIGHTS = { has_promise: 10, has_distributor: 15, has_end_user: 10, has_friction: 10, has_methodology_commitment: 15 }
const PHASE_SCORE_MAX = 40

// A phase's status is derived from its findings, not set by hand.
async function derivePhaseStatus(productSlug: string, phaseId: string): Promise<'passed' | 'open' | 'not_run'> {
  const { data: findings } = await supabase
    .from('product_findings')
    .select('status, blocks_gate')
    .eq('product_slug', productSlug)
    .eq('phase_id', phaseId) as { data: any[] }

  if (!findings || findings.length === 0) return 'not_run' // no certifier run yet
  const openBlocking = findings.filter(f => f.blocks_gate && f.status !== 'closed').length
  return openBlocking === 0 ? 'passed' : 'open'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params
    const body = await request.json()
    const { phaseId } = body

    if (!phaseId) {
      return NextResponse.json({ error: 'phaseId required' }, { status: 400 })
    }

    // Reject any attempt to assert a status directly. Status is earned, not set.
    if ('status' in body) {
      return NextResponse.json(
        { error: 'Phase status is derived from closed findings. Re-run the certifier and POST snags to /findings; status recomputes automatically.' },
        { status: 409 }
      )
    }

    const { data: product } = await supabase
      .from('product_validation_status')
      .select('phase_results')
      .eq('product_slug', productSlug)
      .single() as { data: any }

    const phaseResults = product?.phase_results || {}

    // Derive this phase from its findings. We do NOT wipe findings here — ever.
    const derived = await derivePhaseStatus(productSlug, phaseId)
    phaseResults[phaseId] = {
      ...(phaseResults[phaseId] || {}),
      status: derived,
      tested_at: new Date().toISOString()
      // note: no `findings: []`. Findings live in product_findings, tracked.
    }

    const { data: validationFields } = await supabase
      .from('product_validation_status')
      .select('has_promise, has_distributor, has_end_user, has_friction, has_methodology_commitment')
      .eq('product_slug', productSlug)
      .single() as { data: any }

    let score = 0
    if (validationFields) {
      score += validationFields.has_promise ? SCORE_WEIGHTS.has_promise : 0
      score += validationFields.has_distributor ? SCORE_WEIGHTS.has_distributor : 0
      score += validationFields.has_end_user ? SCORE_WEIGHTS.has_end_user : 0
      score += validationFields.has_friction ? SCORE_WEIGHTS.has_friction : 0
      score += validationFields.has_methodology_commitment ? SCORE_WEIGHTS.has_methodology_commitment : 0

      const passedPhases = Object.values(phaseResults).filter((p: any) => p.status === 'passed').length
      score += (passedPhases / 7) * PHASE_SCORE_MAX
    }

    const { data: updated } = await supabase
      .from('product_validation_status')
      .update({
        phase_results: phaseResults,
        weighted_score_percent: Math.round(score),
        last_scoring_run: new Date().toISOString()
      })
      .eq('product_slug', productSlug)
      .select()
      .single()

    // Gate truth comes from the view (score >= 80 AND zero open blocking findings).
    const { data: gate } = await supabase
      .from('product_gate_status')
      .select('*')
      .eq('product_slug', productSlug)
      .single()

    return NextResponse.json({ product: updated, phaseStatus: derived, gate })
  } catch (err) {
    console.error('Error updating phase:', err)
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 })
  }
}