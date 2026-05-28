#!/usr/bin/env node
/**
 * portfolio-gate-audit-voice-agent — check for voice agent presence.
 *
 * Voice agent is mandatory on product surfaces, not optional.
 *
 * Usage:
 *   portfolio-gate-audit-voice-agent [--root <path>] [--json]
 *
 * Exit codes: 0 pass, 1 fail, 2 config error.
 */
import { runVoiceAgentAudit } from '../audit/voice-agent.js'
import { parseAuditArgs } from './_cli.js'
import { formatAuditResult } from '../audit/shared.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(
      [
        'portfolio-gate-audit-voice-agent — check for voice agent presence (R17)',
        '',
        'Usage:',
        '  portfolio-gate-audit-voice-agent [--root <path>] [--json]',
        '',
        'Voice agent is mandatory on product surfaces (clarifier function).',
        'Exit codes: 0 pass, 1 fail, 2 config error.',
      ].join('\n')
    )
    process.exit(0)
  }

  const opts = {
    rootDir: args.rootDir ?? undefined,
    configPath: null as string | null,
  }

  const result = await runVoiceAgentAudit(opts)

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
