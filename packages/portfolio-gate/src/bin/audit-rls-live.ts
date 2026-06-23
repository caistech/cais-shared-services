#!/usr/bin/env node
/**
 * portfolio-gate-audit-rls-live — CLI wrapper for the LIVE RLS audit (R9).
 *
 * Queries the live database (Supabase Management API) and fails on any public table
 * that is RLS-off AND readable by the anon role. Catches Drizzle-push / dashboard
 * schemas the static audit skips, plus live drift. Skips cleanly when no project
 * ref / management token is configured.
 *
 * Usage:
 *   portfolio-gate-audit-rls-live [--config rls.config.json] [--root .] [--json]
 *
 * Env: SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_ACCESS_TOKEN.
 * Exit codes: 0 pass/skip, 1 fail, 2 config error.
 */
import { runRlsLiveAudit } from '../audit/rls-live.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const args = parseAuditArgs(process.argv.slice(2))
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-rls-live',
      rule: 'R9',
      description:
        'live RLS audit — fails on public tables that are RLS-off and anon-readable',
      configFile: 'rls.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runRlsLiveAudit({
      rootDir: args.rootDir ?? undefined,
      configPath: args.configPath,
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
