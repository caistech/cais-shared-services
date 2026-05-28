#!/usr/bin/env node
/**
 * portfolio-gate-audit-commitment-panel — check for CommitmentPanel presence.
 *
 * Usage:
 *   portfolio-gate-audit-commitment-panel [--root <path>] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runCommitmentPanelAudit } from '../audit/commitment-panel.js'
import { parseAuditArgs } from './_cli.js'
import { formatAuditResult } from '../audit/shared.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      [
        'portfolio-gate-audit-commitment-panel — check for CommitmentPanel (R16)',
        '',
        'Usage:',
        '  portfolio-gate-audit-commitment-panel [--root <path>] [--json]',
        '',
        'Scans for CommitmentPanel on key product pages.',
        'Exit codes: 0 pass, 1 fail, 2 config error.',
      ].join('\n')
    )
    process.exit(0)
  }

  const opts = {
    rootDir: args.rootDir ?? undefined,
    configPath: null as string | null,
  }

  const result = await runCommitmentPanelAudit(opts)

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatAuditResult(result)}\n`)
  }

  process.exit(result.passed ? 0 : 1)
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
