#!/usr/bin/env node
/**
 * Maintenance Health Sensors - Step 7 Operations
 *
 * Runs the smoke test suite and records health to sensor-data/
 * This is the "Smart Sensors" monitoring for Step 7.
 *
 * Tests:
 * - test:auth - Auth pages functional (login, signup, forgot-password, magic-link)
 * - test:routes - Public routes return 200
 * - test:session - Authenticated routes work (requires QA credentials)
 *
 * Usage:
 *   npm run health:sensors
 *   TEST_BASE_URL=https://myproduct.vercel.app TEST_EMAIL=qa@.. TEST_PASSWORD=.. npm run health:sensors
 */

import { resolve, dirname } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { runAuthSmoke, formatAuthResult } from '../../packages/portfolio-gate/dist/smoke/auth.js'
import { runRouteSmoke, formatRouteResult, loadRoutesConfigJson } from '../../packages/portfolio-gate/dist/smoke/routes.js'
import { runAuthSessionSmoke, formatSessionResult } from '../../packages/portfolio-gate/dist/smoke/session.js'

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'skipped'
  durationMs: number
  timestamp: string
  details?: string
  error?: string
}

interface HealthReport {
  generated: string
  environment: string
  checks: HealthCheck[]
}

async function main() {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000'
  const testEmail = process.env.TEST_EMAIL
  const testPassword = process.env.TEST_PASSWORD
  const env = process.env.NODE_ENV || 'development'

  console.log(`\n🩺 Running maintenance health sensors...`)
  console.log(`   Base URL: ${baseUrl}`)
  console.log(`   Environment: ${env}\n`)

  const checks: HealthCheck[] = []

  // 1. Auth smoke test
  const authStart = Date.now()
  try {
    const authResult = await runAuthSmoke({
      baseUrl,
      loginPath: '/login',
      signupPath: '/signup',
      forgotPasswordPath: '/forgot-password',
      magicLinkPath: '/login',
      loginActionPath: '/api/auth/login',
      signupActionPath: '/api/auth/signup',
      forgotPasswordActionPath: '/api/auth/forgot',
      magicLinkActionPath: '/api/auth/magic-link',
    })

    checks.push({
      name: 'auth-smoke',
      status: authResult.passed ? 'pass' : 'fail',
      durationMs: Date.now() - authStart,
      timestamp: new Date().toISOString(),
      details: `${authResult.testedFeatures.length} features tested, ${authResult.complianceIssues.length} compliance issues`,
      error: authResult.failures.length > 0 ? authResult.failures.map(f => f.reason).join('; ') : undefined,
    })

    console.log(`   Auth: ${authResult.passed ? '✅' : '❌'} ${formatAuthResult(authResult).split('\n')[0]}`)
  } catch (err) {
    checks.push({
      name: 'auth-smoke',
      status: 'fail',
      durationMs: Date.now() - authStart,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    })
    console.log(`   Auth: ❌ Failed to run: ${err}`)
  }

  // 2. Routes smoke test
  const routesStart = Date.now()
  try {
    const config = await loadRoutesConfigJson(resolve(process.cwd(), 'routes.config.json'))
    config.baseUrl = baseUrl
    const routesResult = await runRouteSmoke(config)

    checks.push({
      name: 'routes-smoke',
      status: routesResult.passed ? 'pass' : 'fail',
      durationMs: Date.now() - routesStart,
      timestamp: new Date().toISOString(),
      details: `${routesResult.total - routesResult.failures.length}/${routesResult.total} routes passed`,
      error: routesResult.failures.length > 0 ? routesResult.failures.map(f => f.reason).join('; ') : undefined,
    })

    console.log(`   Routes: ${routesResult.passed ? '✅' : '❌'} ${formatRouteResult(routesResult).split('\n')[0]}`)
  } catch (err) {
    checks.push({
      name: 'routes-smoke',
      status: 'fail',
      durationMs: Date.now() - routesStart,
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    })
    console.log(`   Routes: ❌ Failed to run: ${err}`)
  }

  // 3. Session smoke test (requires credentials)
  const sessionStart = Date.now()
  if (testEmail && testPassword) {
    try {
      const sessionResult = await runAuthSessionSmoke({
        baseUrl,
        loginPath: '/login',
        loginActionPath: '/api/auth/login',
        protectedRoutes: ['/dashboard', '/settings'],
        testEmail,
        testPassword,
      })

      checks.push({
        name: 'session-smoke',
        status: sessionResult.passed ? 'pass' : 'fail',
        durationMs: Date.now() - sessionStart,
        timestamp: new Date().toISOString(),
        details: sessionResult.sessionCreated
          ? `${sessionResult.testedRoutes.length} protected routes tested`
          : 'Failed to create session',
        error: sessionResult.failures.length > 0 ? sessionResult.failures.map(f => f.reason).join('; ') : undefined,
      })

      console.log(`   Session: ${sessionResult.passed ? '✅' : '❌'} ${formatSessionResult(sessionResult).split('\n')[0]}`)
    } catch (err) {
      checks.push({
        name: 'session-smoke',
        status: 'fail',
        durationMs: Date.now() - sessionStart,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      })
      console.log(`   Session: ❌ Failed to run: ${err}`)
    }
  } else {
    checks.push({
      name: 'session-smoke',
      status: 'skipped',
      durationMs: Date.now() - sessionStart,
      timestamp: new Date().toISOString(),
      details: 'TEST_EMAIL and TEST_PASSWORD not provided',
    })
    console.log(`   Session: ⏭️ Skipped (no credentials)`)
  }

  // Write health report
  const report: HealthReport = {
    generated: new Date().toISOString(),
    environment: baseUrl,
    checks,
  }

  const sensorDir = resolve(process.cwd(), 'product-factory/7-operations-maintenance/7-operations-maintenance/sensor-data')
  await mkdir(sensorDir, { recursive: true })

  const reportPath = resolve(sensorDir, 'health-latest.json')
  await writeFile(reportPath, JSON.stringify(checks, null, 2))

  console.log(`\n📊 Health report written to: ${reportPath}`)

  // Exit with error if any critical checks failed
  const failures = checks.filter(c => c.status === 'fail')
  if (failures.length > 0) {
    console.log(`\n❌ ${failures.length} health check(s) failed`)
    process.exit(1)
  }

  console.log(`\n✅ All health sensors passed`)
}

main().catch((err) => {
  console.error(`\n💥 Fatal error: ${err}`)
  process.exit(2)
})
