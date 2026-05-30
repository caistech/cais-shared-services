import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SCORE_WEIGHTS = {
  has_promise: 10,
  has_distributor: 15,
  has_end_user: 10,
  has_friction: 10,
  has_methodology_commitment: 15,
}

const PHASE_SCORE_MAX = 40

async function calculateWeightedScore(client: typeof supabase, productSlug: string): Promise<number> {
  const { data: prod } = await client
    .from('product_validation_status')
    .select('has_promise, has_distributor, has_end_user, has_friction, has_methodology_commitment, phase_results')
    .eq('product_slug', productSlug)
    .single() as { data: any }

  if (!prod) return 0

  let score = 0
  score += prod.has_promise ? SCORE_WEIGHTS.has_promise : 0
  score += prod.has_distributor ? SCORE_WEIGHTS.has_distributor : 0
  score += prod.has_end_user ? SCORE_WEIGHTS.has_end_user : 0
  score += prod.has_friction ? SCORE_WEIGHTS.has_friction : 0
  score += prod.has_methodology_commitment ? SCORE_WEIGHTS.has_methodology_commitment : 0

  const phaseResults = prod.phase_results || {}
  const passedPhases = Object.values(phaseResults).filter((p: any) => p.status === 'passed').length
  const phaseScore = (passedPhases / 7) * PHASE_SCORE_MAX
  score += phaseScore

  return Math.round(score)
}

const ALLOWED_FIELDS = [
  'has_promise',
  'has_distributor',
  'has_end_user',
  'has_friction',
  'has_methodology_commitment',
  'mvp_url'
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params
    const body = await request.json()

    const updates: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    updates.last_validation_update = new Date().toISOString()

    const { data: product, error } = await supabase
      .from('product_validation_status')
      .update(updates)
      .eq('product_slug', productSlug)
      .select()
      .single()

    if (error) throw error

    const newScore = await calculateWeightedScore(supabase, productSlug)
    const { data: updated } = await supabase
      .from('product_validation_status')
      .update({ weighted_score_percent: newScore, last_scoring_run: new Date().toISOString() })
      .eq('product_slug', productSlug)
      .select()
      .single()

    return NextResponse.json({ product: updated })
  } catch (err) {
    console.error('Error updating validation:', err)
    return NextResponse.json({ error: 'Failed to update validation' }, { status: 500 })
  }
}
