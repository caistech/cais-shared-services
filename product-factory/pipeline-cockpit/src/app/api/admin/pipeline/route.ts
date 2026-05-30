import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('product_validation_status')
      .select('*')
      .order('display_name')

    if (error) throw error

    return NextResponse.json({ products })
  } catch (err) {
    console.error('Error fetching products:', err)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}
