/**
 * RLS audit — Portfolio Standard R9 enforcement.
 *
 * Static analysis: scans `supabase/migrations/*.sql` for any RLS policy that
 * uses `USING (true)` against a table matching the data-bearing-table
 * allowlist. Surfaces file + line of each violation. Allowlist is regex-based
 * and configurable via `rls.config.{json,ts}` so per-product tables can opt in
 * or out.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R9.
 */
import { resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
  readFileOptional,
  relativeTo,
  walkFiles,
} from './shared.js'

export interface RlsAuditConfig {
  /** Glob-ish directory containing migration files. Default: `supabase/migrations`. */
  migrationsDir?: string
  /**
   * Regex of table names treated as data-bearing. Any RLS `USING (true)` on a
   * matching table FAILs the build. Provide as a string — compiled with `i` flag.
   * Default covers the most common portfolio tables.
   */
  dataBearingTablesRegex?: string
  /** Additional table names to ignore even if they match the regex. */
  exemptTables?: string[]
}

export interface RlsAuditOptions {
  /** Repo root. Defaults to `process.cwd()`. */
  rootDir?: string
  /** Override the path to the config file. */
  configPath?: string | null
}

const DEFAULT_DATA_BEARING_REGEX =
  'panels|interviews|users|customers|orders|subscriptions|plans|prices|projects|reports|documents|messages|notifications|agents|clients|profiles|sessions|tokens'

const POLICY_LINE_RE = /\b(CREATE|ALTER)\s+POLICY\b/i
const USING_TRUE_RE = /USING\s*\(\s*true\s*\)/i
const ON_TABLE_RE = /\bON\s+(?:public\.)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i

export async function runRlsAudit(options: RlsAuditOptions = {}): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<RlsAuditConfig>(options.configPath ?? null)) ?? {}

  const migrationsDir = resolve(
    rootDir,
    config.migrationsDir ?? 'supabase/migrations'
  )
  const exempt = new Set((config.exemptTables ?? []).map((t) => t.toLowerCase()))
  const dataBearing = new RegExp(
    `^(?:${config.dataBearingTablesRegex ?? DEFAULT_DATA_BEARING_REGEX})$`,
    'i'
  )

  const findings: AuditFinding[] = []
  const files = await walkFiles(migrationsDir, { extensions: ['.sql'] })

  if (files.length === 0) {
    return {
      audit: 'rls',
      rule: 'R9',
      passed: true,
      skipped: true,
      skipReason: `no migrations found under ${config.migrationsDir ?? 'supabase/migrations'}`,
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  for (const file of files) {
    const content = await readFileOptional(file)
    if (!content) continue
    const lines = content.split(/\r?\n/)
    // Multi-line awareness: a policy block can span several lines. Track the
    // current policy's target table from the most recent `ON <table>` token.
    let currentTable: string | null = null
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      // Reset table context when a new policy starts.
      if (POLICY_LINE_RE.test(line)) {
        const m = line.match(ON_TABLE_RE)
        if (m) currentTable = m[1].toLowerCase()
      } else {
        // The `ON <table>` clause may appear on a continuation line.
        const m = line.match(ON_TABLE_RE)
        if (m && currentTable === null) currentTable = m[1].toLowerCase()
      }
      if (USING_TRUE_RE.test(line)) {
        const table = currentTable ?? '(unknown)'
        if (table !== '(unknown)' && !dataBearing.test(table)) continue
        if (exempt.has(table)) continue
        findings.push({
          severity: 'fail',
          message: `RLS policy uses USING (true) on data-bearing table "${table}"`,
          file: relativeTo(rootDir, file),
          line: i + 1,
          detail: line.trim(),
        })
      }
      // Statement terminator resets the table context.
      if (/;\s*$/.test(line)) currentTable = null
    }
  }

  return {
    audit: 'rls',
    rule: 'R9',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}
