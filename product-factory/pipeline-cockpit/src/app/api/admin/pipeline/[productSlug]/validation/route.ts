import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    return NextResponse.json({ product })
  } catch (err) {
    console.error('Error updating validation:', err)
    return NextResponse.json({ error: 'Failed to update validation' }, { status: 500 })
  }
}
