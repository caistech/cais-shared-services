#!/usr/bin/env node
/**
 * portfolio-gate-audit-sample-artefact — CLI wrapper for the sample-artefact
 * presence audit (R14).
 *
 * Usage:
 *   portfolio-gate-audit-sample-artefact [--config sample.config.json] \
 *     [--base-url https://preview.example.com] [--root .] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runSampleAudit } from '../audit/sample.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-sample-artefact',
      rule: 'R14',
      description:
        'Sample artefact presence audit — checks app/sample, app/demo, or <SampleArtefact> import',
      configFile: 'sample.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runSampleAudit({
      rootDir: args.rootDir ?? undefined,
      configPath: args.configPath,
      baseUrlOverride: args.baseUrlOverride,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      process.stdout.write(`${formatAuditResult(result)}\n`)
    }
    process.exit(result.passed ? 0 : 1)
  } catch (err) {
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`
    )
    process.exit(2)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? err.message : String(err)}\n`
  )
  process.exit(2)
})
