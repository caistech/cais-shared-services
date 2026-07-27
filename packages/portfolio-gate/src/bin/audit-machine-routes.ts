#!/usr/bin/env node
/**
 * portfolio-gate-audit-machine-routes — do the routes machines call survive the middleware matcher?
 *
 * Usage:
 *   portfolio-gate-audit-machine-routes [--json]
 *
 * Mark any route called by something that is not a browser (vendor webhook, cron, health probe)
 * with `@machine-callable` in a comment. This fails when the Next middleware matcher would still
 * capture it — which redirects the caller to a login page and makes the route silently never run.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runMachineRoutesAudit } from '../audit/machine-routes.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-machine-routes',
      rule: 'machine-callable-routes',
      description:
        'Fails when a route marked @machine-callable is still captured by the Next middleware ' +
        'matcher — a 307 to /login that no log records and no test notices',
      configFile: '(none — the marker lives in the route file)',
    })
    process.exit(0)
  }

  try {
    const result = await runMachineRoutesAudit({ rootDir: args.rootDir ?? undefined })
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
