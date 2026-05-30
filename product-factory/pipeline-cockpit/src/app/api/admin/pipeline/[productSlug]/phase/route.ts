import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params
    const body = await request.json()
    const { phaseId, status } = body

    if (!phaseId || !status) {
      return NextResponse.json({ error: 'phaseId and status required' }, { status: 400 })
    }

    const { data: product } = await supabase
      .from('product_validation_status')
      .select('phase_results')
      .eq('product_slug', productSlug)
      .single() as { data: any }

    const phaseResults = product?.phase_results || {}
    phaseResults[phaseId] = {
      status,
      tested_at: new Date().toISOString(),
      findings: status === 'passed' ? [] : (phaseResults[phaseId]?.findings || [])
    }

    const { data: validationFields } = await supabase
      .from('product_validation_status')
      .select('has_promise, has_distributor, has_end_user, has_friction, has_methodology_commitment')
      .eq('product_slug', productSlug)
      .single() as { data: any }

    const SCORE_WEIGHTS = { has_promise: 10, has_distributor: 15, has_end_user: 10, has_friction: 10, has_methodology_commitment: 15 }
    const PHASE_SCORE_MAX = 40

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

    return NextResponse.json({ product: updated })
  } catch (err) {
    console.error('Error updating phase:', err)
    return NextResponse.json({ error: 'Failed to update phase' }, { status: 500 })
  }
}
