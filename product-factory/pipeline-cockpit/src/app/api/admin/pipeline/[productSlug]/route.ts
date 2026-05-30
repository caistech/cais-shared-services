import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params
    const { data: product, error } = await supabase
      .from('product_validation_status')
      .select('*')
      .eq('product_slug', productSlug)
      .single()

    if (error) throw error

    return NextResponse.json({ product })
  } catch (err) {
    console.error('Error fetching product:', err)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}
