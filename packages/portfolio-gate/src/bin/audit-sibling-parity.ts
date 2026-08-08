#!/usr/bin/env node
/**
 * portfolio-gate-audit-sibling-parity — things that must be true in more than one place at once.
 *
 * Usage:
 *   portfolio-gate-audit-sibling-parity [--config sibling-parity.config.json] [--json]
 *
 * Every other audit here interrogates ONE deployment. This one interrogates the RELATIONSHIP
 * between two, which is where a whole class of silent failure lives: a setting and the code it
 * depends on in different places, only one of them visible from where you are standing.
 *
 * Asserts three things across declared siblings: files that are byte-identical by design really
 * are; a shared dependency is in every sibling that needs it; a URL answers the same status on
 * every sibling site.
 *
 * ⚠️ Reports partial runs rather than passing them. In CI usually only one sibling repo is checked
 * out, so file/dependency comparison SKIPS with a warning while the live checks still run.
 *
 * SKIPS entirely with no `sibling-parity.config.json`.
 *
 * Exit codes: 0 pass (or skipped), 1 fail, 2 error.
 */
import { runSiblingParityAudit } from '../audit/sibling-parity.js'
import { formatAuditResult } from '../audit/shared.js'
import { parseAuditArgs, printAuditHelp } from './_cli.js'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseAuditArgs(argv)
  if (args.help) {
    printAuditHelp({
      name: 'portfolio-gate-audit-sibling-parity',
      rule: 'sibling-parity',
      description:
        'Fails when paired repos or paired sites disagree — a by-design-identical file that has ' +
        'drifted, a shared dependency present in one sibling and absent from another, or a URL ' +
        'that answers differently across sites meant to be configured alike',
      configFile: 'sibling-parity.config.json',
    })
    process.exit(0)
  }

  try {
    const result = await runSiblingParityAudit({
      cwd: args.rootDir ?? undefined,
      configPath: args.configPath,
    })
    process.stdout.write(
      args.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatAuditResult(result)}\n`,
    )
    // `exitCode` and return, NOT process.exit(). This audit holds open fetch handles, and calling
    // exit() while they close aborts with a libuv assertion on Windows — exiting 127, "crashed",
    // where 1, "found a problem", was meant. A guard whose failure code is ambiguous costs somebody
    // an afternoon working out whether the sites are broken or the check is.
    process.exitCode = result.passed ? 0 : 1
    return
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
})
