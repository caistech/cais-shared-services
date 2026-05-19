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

  const DROP_POLICY_RE = /\bDROP\s+POLICY\b/i
  // Lines whose content is purely an SQL line comment (`-- ...`). We do this
  // before any policy/USING matching so audit messages can't be false-positived
  // by documentation strings that mention USING (true).
  const LINE_COMMENT_RE = /^\s*--/

  for (const file of files) {
    const content = await readFileOptional(file)
    if (!content) continue
    // Strip /* … */ block comments before per-line analysis. SQL block comments
    // are rare in migrations but the noise they cause is high.
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\r\n]/g, ' ')
    )
    const lines = stripped.split(/\r?\n/)
    // Track current statement context: are we inside a CREATE/ALTER POLICY
    // block? If yes, what table does it apply to? Reset on every `;`. A line
    // that contains `DROP POLICY` is excluded — those legitimately mention
    // USING (true) when documenting the policy being removed.
    let inCreatePolicy = false
    let currentTable: string | null = null
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      // Skip pure SQL line comments.
      if (LINE_COMMENT_RE.test(line)) {
        if (/;\s*$/.test(line)) {
          inCreatePolicy = false
          currentTable = null
        }
        continue
      }
      // Skip lines that DROP a policy — these legitimately echo the old USING
      // (true) clause in their literal form for clarity.
      if (DROP_POLICY_RE.test(line)) {
        if (/;\s*$/.test(line)) {
          inCreatePolicy = false
          currentTable = null
        }
        continue
      }
      // Enter a CREATE/ALTER POLICY block.
      if (POLICY_LINE_RE.test(line)) {
        inCreatePolicy = true
        const m = line.match(ON_TABLE_RE)
        if (m) currentTable = m[1].toLowerCase()
      } else if (inCreatePolicy && currentTable === null) {
        // `ON <table>` may appear on a continuation line of the CREATE.
        const m = line.match(ON_TABLE_RE)
        if (m) currentTable = m[1].toLowerCase()
      }
      // Only flag USING (true) when we are inside an active CREATE/ALTER POLICY.
      if (inCreatePolicy && USING_TRUE_RE.test(line)) {
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
      // Statement terminator resets the policy + table context.
      if (/;\s*$/.test(line)) {
        inCreatePolicy = false
        currentTable = null
      }
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
