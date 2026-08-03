#!/usr/bin/env node
/**
 * portfolio-gate-audit-first-paint — does the page a visitor lands on SHOW them anything before the
 * JavaScript arrives?
 *
 * Usage:
 *   portfolio-gate-audit-first-paint --base-url https://example.com [--min-chars 200] [--json]
 *
 * Probes every page marked `@public-route` and fails when the server response carries a header and
 * a footer with no content between them — a client-rendered page that stares back blank while it
 * hydrates. Every status-code check in this package passes over that: the page answers 200, serves
 * the right commit, and is not redirected.
 *
 * Base URL resolves: --base-url → PORTFOLIO_GATE_PREVIEW_URL → PUBLIC_ALIAS.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runFirstPaintAudit } from '../audit/first-paint.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`${name}=`))
  return inline ? inline.slice(name.length + 1) : undefined
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-first-paint',
      rule: 'first-paint-content',
      description:
        'Fails when a page marked @public-route answers 200 with its content missing — chrome ' +
        'served, body empty until hydration. Measures visible text OUTSIDE <header>/<footer>/<nav>, ' +
        'because the observed failures served both',
      configFile: '(none — the marker lives in the page file)',
    })
    process.exit(0)
  }

  const baseUrl =
    flagValue(argv, '--base-url') ??
    process.env.PORTFOLIO_GATE_PREVIEW_URL ??
    process.env.PUBLIC_ALIAS

  const rawMin = flagValue(argv, '--min-chars')
  const minChars = rawMin ? Number.parseInt(rawMin, 10) : undefined
  if (rawMin && (!Number.isFinite(minChars) || (minChars as number) < 0)) {
    process.stderr.write(`error: --min-chars must be a non-negative integer, got "${rawMin}"\n`)
    process.exit(2)
  }

  try {
    const result = await runFirstPaintAudit({
      rootDir: args.rootDir ?? undefined,
      baseUrl,
      minChars,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      process.stdout.write(`${formatAuditResult(result)}\n`)
    }
    process.exit(result.passed ? 0 : 1)
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
})
