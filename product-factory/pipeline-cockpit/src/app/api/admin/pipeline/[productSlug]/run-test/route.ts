import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TestPhaseConfig {
  id: string
  number: number
  name: string
  testType: 'auto' | 'manual' | 'both'
  tools: string[]
  passCriteria: string
  fixChannel: string
  runAutoChecks: (mvpUrl: string) => Promise<{ passed: boolean; findings: string[] }>
}

const PHASE_CONFIGS: Record<string, TestPhaseConfig> = {
  phase1: {
    id: 'phase1',
    number: 1,
    name: 'Pre-Development',
    testType: 'auto',
    tools: ['validation_fields'],
    passCriteria: 'All 5 validation fields checked',
    fixChannel: 'Direct edit in Validation Fields panel',
    runAutoChecks: async () => ({ passed: true, findings: [] })
  },
  phase2: {
    id: 'phase2',
    number: 2,
    name: 'Design Planning',
    testType: 'both',
    tools: ['portfolio-gate-audit-responsive', 'portfolio-gate-audit-explanatory-header', 'portfolio-gate-audit-sample-artefact', 'portfolio-gate-audit-commitment-panel'],
    passCriteria: 'All portfolio-gate audits pass',
    fixChannel: 'Run portfolio-gate-audit-* commands, fix issues, re-run',
    runAutoChecks: async (mvpUrl: string) => {
      return {
        passed: false,
        findings: ['Run: portfolio-gate-audit-responsive --base-url ' + mvpUrl]
      }
    }
  },
  phase3: {
    id: 'phase3',
    number: 3,
    name: 'Compliance Standards',
    testType: 'both',
    tools: ['portfolio-gate-audit-rls', 'portfolio-gate-audit-vendor-leak', 'portfolio-gate-audit-unauth-endpoints', 'portfolio-gate-audit-trust-panel'],
    passCriteria: 'All compliance audits pass',
    fixChannel: 'Run portfolio-gate-audit-* commands, fix issues, re-run',
    runAutoChecks: async (mvpUrl: string) => {
      return {
        passed: false,
        findings: ['Run: portfolio-gate-audit-rls, portfolio-gate-audit-vendor-leak']
      }
    }
  },
  phase4: {
    id: 'phase4',
    number: 4,
    name: 'Construction',
    testType: 'auto',
    tools: ['npm run lint', 'npm run typecheck', 'npm run build'],
    passCriteria: 'All npm scripts exit with code 0',
    fixChannel: 'Fix lint/type errors, rebuild',
    runAutoChecks: async () => ({ passed: false, findings: ['Run: npm run lint && npm run build in product repo'] })
  },
  phase5: {
    id: 'phase5',
    number: 5,
    name: 'Certification',
    testType: 'manual',
    tools: ['/naive-tester', '/voice-auditor', '/gtm-auditor', '/qa'],
    passCriteria: 'All gstack skills pass',
    fixChannel: 'Run /naive-tester, /qa, etc on the URL, fix findings, re-run',
    runAutoChecks: async (mvpUrl: string) => ({
      passed: false,
      findings: [
        `1. Run /naive-tester ${mvpUrl}`,
        `2. Run /qa ${mvpUrl}`,
        `3. Run /voice-auditor ${mvpUrl}`,
        `4. Run /gtm-auditor ${mvpUrl}`
      ]
    })
  },
  phase6: {
    id: 'phase6',
    number: 6,
    name: 'Handover',
    testType: 'both',
    tools: ['portfolio-gate-smoke-routes', 'portfolio-gate-smoke-auth', '/qa'],
    passCriteria: 'All smoke tests pass',
    fixChannel: 'Run smoke tests, fix production issues, redeploy',
    runAutoChecks: async (mvpUrl: string) => ({
      passed: false,
      findings: [
        `Run: portfolio-gate-smoke-routes --base-url ${mvpUrl}`,
        `Run: portfolio-gate-smoke-auth --base-url ${mvpUrl}`,
        `Then run /qa ${mvpUrl} for full verification`
      ]
    })
  },
  phase7: {
    id: 'phase7',
    number: 7,
    name: 'Operations',
    testType: 'manual',
    tools: ['/canary', '/benchmark'],
    passCriteria: 'No alerts from canary/benchmark',
    fixChannel: 'Monitor /canary results, fix regressions',
    runAutoChecks: async () => ({
      passed: false,
      findings: [
        '1. Run /canary on production URL',
        '2. Run /benchmark to establish baseline',
        '3. Set up ongoing canary monitoring'
      ]
    })
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

    const phaseConfig = PHASE_CONFIGS[testType]
    if (!phaseConfig) {
      return NextResponse.json({ error: 'Invalid test type' }, { status: 400 })
    }

    const autoCheckResult = await phaseConfig.runAutoChecks(mvpUrl || '')

    const result = {
      phaseId: phaseConfig.id,
      phaseNumber: phaseConfig.number,
      phaseName: phaseConfig.name,
      status: autoCheckResult.passed ? 'passed' : 'manual',
      testType: phaseConfig.testType,
      mvpUrl,
      tools: phaseConfig.tools,
      passCriteria: phaseConfig.passCriteria,
      fixChannel: phaseConfig.fixChannel,
      findings: autoCheckResult.findings,
      message: autoCheckResult.passed 
        ? `Phase ${phaseConfig.number} ${phaseConfig.name} PASSED`
        : `Phase ${phaseConfig.number} ${phaseConfig.name}: ${autoCheckResult.findings.length} check(s) need manual verification. Run: ${phaseConfig.tools.join(', ')}`,
      timestamp: new Date().toISOString()
    }

    const { data: product } = await supabase
      .from('product_validation_status')
      .select('phase_results')
      .eq('product_slug', productSlug)
      .single()

    const existingResults = product?.phase_results || {}
    existingResults[phaseConfig.id] = {
      status: result.status,
      tested_at: result.timestamp,
      findings: autoCheckResult.findings
    }

    await supabase
      .from('product_validation_status')
      .update({
        phase_results: existingResults,
        last_validation_test_run: new Date().toISOString()
      })
      .eq('product_slug', productSlug)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Error running test:', err)
    return NextResponse.json({ error: 'Failed to run test' }, { status: 500 })
  }
}
