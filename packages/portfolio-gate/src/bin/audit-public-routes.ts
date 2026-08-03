#!/usr/bin/env node
/**
 * portfolio-gate-audit-public-routes — can a visitor with no session actually reach the pages we
 * publish?
 *
 * Usage:
 *   portfolio-gate-audit-public-routes --base-url https://example.com [--json]
 *
 * Mark any page meant to be publicly reachable with `@public-route` in a comment. This probes each
 * one WITHOUT following redirects and fails when an unauthenticated visitor is bounced — the case
 * `curl -L`, an HTTP status check and an app-marker assertion all pass straight through, because
 * the login page answers 200 and carries the product name.
 *
 * Base URL resolves: --base-url → PORTFOLIO_GATE_PREVIEW_URL → PUBLIC_ALIAS.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runPublicRoutesAudit } from '../audit/public-routes.js'
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
      name: 'portfolio-gate-audit-public-routes',
      rule: 'public-route-reachability',
      description:
        'Fails when a page marked @public-route redirects an unauthenticated visitor (307 to a ' +
        'login page) instead of answering directly — the failure that passes every status-code, ' +
        'app-marker and deploy-SHA check',
      configFile: '(none — the marker lives in the page file)',
    })
    process.exit(0)
  }

  const baseUrl =
    flagValue(argv, '--base-url') ??
    process.env.PORTFOLIO_GATE_PREVIEW_URL ??
    process.env.PUBLIC_ALIAS

  try {
    const result = await runPublicRoutesAudit({
      rootDir: args.rootDir ?? undefined,
      baseUrl,
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
