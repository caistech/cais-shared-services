import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TEST_CONFIGS: Record<string, { name: string; skill: string; autoChecks: string[] }> = {
  step8: {
    name: 'Compliance Tests',
    skill: 'qa',
    autoChecks: [
      'Auth page reachable',
      'Metadata present',
      'Security headers',
      'No vendor leak',
    ]
  },
  step9: {
    name: 'Validation Tests',
    skill: 'naive-tester',
    autoChecks: [
      'Basic accessibility',
      'Page load check',
    ]
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productSlug: string }> }
) {
  try {
    const { productSlug } = await params
    const body = await request.json()
    const { testType, mvpUrl } = body

    const testConfig = TEST_CONFIGS[testType]
    if (!testConfig) {
      return NextResponse.json({ error: 'Invalid test type' }, { status: 400 })
    }

    const results = {
      status: 'manual',
      testType,
      testName: testConfig.name,
      mvpUrl,
      skill: testConfig.skill,
      autoChecks: testConfig.autoChecks,
      instructions: `Run /${testConfig.skill} on ${mvpUrl}`,
      message: `To complete ${testConfig.name}, run /${testConfig.skill} in Claude Code on ${mvpUrl}`,
      timestamp: new Date().toISOString()
    }

    await supabase
      .from('product_validation_status')
      .update({
        last_validation_test_run: new Date().toISOString(),
        validation_test_status: 'manual'
      })
      .eq('product_slug', productSlug)

    return NextResponse.json(results)
  } catch (err) {
    console.error('Error running test:', err)
    return NextResponse.json({ error: 'Failed to run test' }, { status: 500 })
  }
}
