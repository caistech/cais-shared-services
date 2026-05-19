#!/usr/bin/env node
/**
 * portfolio-gate-audit-all — run every static audit + emit a summary.
 *
 * Runs in this order (independent — one audit's failure doesn't stop the rest):
 *   1. RLS (R9)
 *   2. Vendor-leak (R11)
 *   3. Unauth endpoints (R7 / R9 boundary)
 *   4. Sample artefact (R8)
 *   5. Explanatory header (R3)
 *   6. Trust panel (R15)
 *   7. Responsive (responsive-design) — only if --base-url + playwright installed
 *
 * Usage:
 *   portfolio-gate-audit-all [--root .] [--base-url URL] [--json]
 *
 * Each audit reads its OWN config file from the cwd if present
 * (rls.config.json, vendor-leak.config.json, etc.) — there's no master config
 * by design; individual config files are easier to discover and edit.
 *
 * Exit codes: 0 all-pass, 1 any-fail, 2 unexpected error.
 */
import { runRlsAudit } from '../audit/rls.js'
import { runVendorLeakAudit } from '../audit/vendor-leak.js'
import { runUnauthEndpointsAudit } from '../audit/unauth-endpoints.js'
import { runSampleAudit } from '../audit/sample.js'
import { runExplanatoryHeaderAudit } from '../audit/explanatory-header.js'
import { runTrustPanelAudit } from '../audit/trust-panel.js'
import { runResponsiveAudit } from '../audit/responsive.js'
import { type AuditResult, formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs } from './_cli.js'

type AuditRunner = () => Promise<AuditResult>

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      [
        'portfolio-gate-audit-all — run every static audit + a summary (Portfolio Standard)',
        '',
        'Usage:',
        '  portfolio-gate-audit-all [--root <path>] [--base-url <url>] [--json]',
        '',
        'Each audit reads its own per-audit config from the cwd if present',
        '(rls.config.json, vendor-leak.config.json, etc.). No master config.',
        '',
        'Exit codes: 0 all-pass, 1 any-fail, 2 unexpected error.',
        '',
      ].join('\n')
    )
    process.exit(0)
  }

  const opts = {
    rootDir: args.rootDir ?? undefined,
    configPath: null as string | null,
  }
  const runners: Array<{ name: string; run: AuditRunner }> = [
    { name: 'rls', run: () => runRlsAudit(opts) },
    { name: 'vendor-leak', run: () => runVendorLeakAudit(opts) },
    {
      name: 'unauth-endpoints',
      run: () => runUnauthEndpointsAudit(opts),
    },
    { name: 'sample-artefact', run: () => runSampleAudit(opts) },
    {
      name: 'explanatory-header',
      run: () => runExplanatoryHeaderAudit(opts),
    },
    { name: 'trust-panel', run: () => runTrustPanelAudit(opts) },
    {
      name: 'responsive',
      run: () =>
        runResponsiveAudit({ ...opts, baseUrlOverride: args.baseUrlOverride }),
    },
  ]

  const results: AuditResult[] = []
  for (const { name, run } of runners) {
    try {
      results.push(await run())
    } catch (err) {
      results.push({
        audit: name,
        rule: '-',
        passed: false,
        findings: [
          {
            severity: 'fail',
            message: `audit threw: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        durationMs: 0,
      })
    }
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
  } else {
    for (const r of results) {
      process.stdout.write(`${formatAuditResult(r)}\n`)
    }
    const totalFail = results.filter((r) => !r.passed).length
    const totalSkip = results.filter((r) => r.skipped).length
    const totalPass = results.length - totalFail - totalSkip
    process.stdout.write(
      `\n[portfolio-gate] summary: ${totalPass} pass, ${totalSkip} skipped, ${totalFail} fail (of ${results.length})\n`
    )
  }

  const anyFail = results.some((r) => !r.passed)
  process.exit(anyFail ? 1 : 0)
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
