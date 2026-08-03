#!/usr/bin/env node
/**
 * portfolio-gate-audit-input-response — type into it, submit, and assert something came back.
 *
 * Usage:
 *   portfolio-gate-audit-input-response --base-url https://example.com [--settle-ms 5000] [--json]
 *
 * Mark a page `@accepts-input` (optionally `@accepts-input open=".launcher"` when the box is behind
 * a disclosure control). Every presence check in this package passes over a control that renders
 * perfectly and swallows what is typed into it — that is the defect this exercises.
 *
 * ⚠️ THIS REALLY SUBMITS, against whatever --base-url points at. Marking a signup form creates
 * accounts; marking a password-reset box sends mail. The marker is a statement that junk may be
 * submitted into that surface repeatedly, forever, on every push.
 *
 * Requires playwright (an optional peer). Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runInputResponseAudit } from '../audit/input-response.js'
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
      name: 'portfolio-gate-audit-input-response',
      rule: 'input-response',
      description:
        'Submits into every page marked @accepts-input and fails when nothing comes back — no ' +
        'network request and no new text. Catches the widget that renders correctly and eats the ' +
        'question, which every presence check reports as live',
      configFile: '(none — the marker lives in the page file)',
    })
    process.exit(0)
  }

  const baseUrl =
    flagValue(argv, '--base-url') ??
    process.env.PORTFOLIO_GATE_PREVIEW_URL ??
    process.env.PUBLIC_ALIAS

  const rawSettle = flagValue(argv, '--settle-ms')
  const settleMs = rawSettle ? Number.parseInt(rawSettle, 10) : undefined
  if (rawSettle && (!Number.isFinite(settleMs) || (settleMs as number) < 0)) {
    process.stderr.write(`error: --settle-ms must be a non-negative integer, got "${rawSettle}"\n`)
    process.exit(2)
  }

  const rawAttempts = flagValue(argv, '--attempts')
  const attempts = rawAttempts ? Number.parseInt(rawAttempts, 10) : undefined
  if (rawAttempts && (!Number.isFinite(attempts) || (attempts as number) < 1)) {
    process.stderr.write(`error: --attempts must be a positive integer, got "${rawAttempts}"\n`)
    process.exit(2)
  }

  const rawRate = flagValue(argv, '--min-pass-rate')
  const minPassRate = rawRate ? Number.parseFloat(rawRate) : undefined
  if (
    rawRate &&
    (!Number.isFinite(minPassRate) || (minPassRate as number) < 0 || (minPassRate as number) > 1)
  ) {
    process.stderr.write(`error: --min-pass-rate must be between 0 and 1, got "${rawRate}"\n`)
    process.exit(2)
  }

  try {
    const result = await runInputResponseAudit({
      rootDir: args.rootDir ?? undefined,
      baseUrl,
      settleMs,
      attempts,
      minPassRate,
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
