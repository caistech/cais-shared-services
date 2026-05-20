/**
 * RLS audit — Portfolio Standard R9 enforcement.
 *
 * Walks `supabase/migrations/*.sql` in apply order (alphabetical/numerical
 * filename order) and tracks the LIVE state of each `CREATE POLICY` across
 * the migration history. A `USING (true)` policy that gets dropped by a
 * later migration is NOT flagged — only policies that survive into the
 * current state count.
 *
 * Also distinguishes `USING (true) TO anon` (a common pattern for explicitly
 * public-readable data, e.g. trust scoring landing pages) — these are
 * downgraded to `warn` rather than `fail` so genuinely-public products
 * aren't forced to lie via the exempt list.
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

interface PolicyState {
  policyName: string
  table: string
  openWide: boolean
  scopedToAnon: boolean
  scopedToServiceRole: boolean
  file: string
  line: number
  rawText: string
}

const DEFAULT_DATA_BEARING_REGEX =
  'panels|interviews|users|customers|orders|subscriptions|plans|prices|projects|reports|documents|messages|notifications|agents|clients|profiles|sessions|tokens'

const POLICY_LINE_RE = /\b(CREATE|ALTER)\s+POLICY\b/i
const USING_TRUE_RE = /USING\s*\(\s*true\s*\)/i
const ON_TABLE_RE = /\bON\s+(?:public\.)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i
// CREATE/ALTER POLICY "name with spaces" ON ...  |  `name` ON ...  |  bareName ON ...
// Quoted forms allow spaces, bare forms don't. Three alternates in the same group.
const POLICY_NAME_RE =
  /\b(?:CREATE|ALTER)\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))/i
const DROP_POLICY_RE = /\bDROP\s+POLICY\b/i
const DROP_POLICY_FULL_RE =
  /\bDROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_]*))\s+ON\s+(?:public\.)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i
const TO_ANON_RE = /\bTO\s+(?:[^,;]*,\s*)*anon\b/i
const TO_SERVICE_ROLE_RE = /\bTO\s+(?:[^,;]*,\s*)*service_role\b/i
const LINE_COMMENT_RE = /^\s*--/

export async function runRlsAudit(options: RlsAuditOptions = {}): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<RlsAuditConfig>(
      options.configPath ?? resolve(rootDir, 'rls.config.json')
    )) ?? {}

  const migrationsDir = resolve(
    rootDir,
    config.migrationsDir ?? 'supabase/migrations'
  )
  const exempt = new Set((config.exemptTables ?? []).map((t) => t.toLowerCase()))
  const dataBearing = new RegExp(
    `^(?:${config.dataBearingTablesRegex ?? DEFAULT_DATA_BEARING_REGEX})$`,
    'i'
  )

  const files = (await walkFiles(migrationsDir, { extensions: ['.sql'] })).sort()

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

  // Track LIVE policy state keyed by "<table>::<policyName>". Replay each
  // migration in apply order — CREATE sets the entry, DROP removes it,
  // ALTER updates the open-wide flag in place.
  const live = new Map<string, PolicyState>()

  for (const file of files) {
    const content = await readFileOptional(file)
    if (!content) continue
    const relFile = relativeTo(rootDir, file)
    // Strip /* … */ block comments before per-line analysis.
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, (m) =>
      m.replace(/[^\r\n]/g, ' ')
    )
    const lines = stripped.split(/\r?\n/)

    let inCreatePolicy = false
    let currentName: string | null = null
    let currentTable: string | null = null
    let currentLine = 0
    let currentText = ''
    let currentOpenWide = false
    let currentScopedAnon = false
    let currentScopedServiceRole = false

    const flushCreate = () => {
      if (currentName && currentTable) {
        const key = `${currentTable}::${currentName}`
        live.set(key, {
          policyName: currentName,
          table: currentTable,
          openWide: currentOpenWide,
          scopedToAnon: currentScopedAnon,
          scopedToServiceRole: currentScopedServiceRole,
          file: relFile,
          line: currentLine,
          rawText: currentText.trim().slice(0, 240),
        })
      }
      inCreatePolicy = false
      currentName = null
      currentTable = null
      currentLine = 0
      currentText = ''
      currentOpenWide = false
      currentScopedAnon = false
      currentScopedServiceRole = false
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const terminator = /;\s*$/.test(line)

      // Pure SQL line comment — skip but still respect statement terminator.
      if (LINE_COMMENT_RE.test(line)) {
        if (terminator && inCreatePolicy) flushCreate()
        continue
      }

      // DROP POLICY removes the entry from live state.
      const dropMatch = line.match(DROP_POLICY_FULL_RE)
      if (dropMatch) {
        const dropName = dropMatch[1] ?? dropMatch[2] ?? dropMatch[3]
        const dropTable = dropMatch[4].toLowerCase()
        live.delete(`${dropTable}::${dropName}`)
        if (terminator && inCreatePolicy) flushCreate()
        continue
      }
      if (DROP_POLICY_RE.test(line)) {
        // Generic DROP POLICY mention without name/table on this line —
        // skip but maintain context.
        if (terminator && inCreatePolicy) flushCreate()
        continue
      }

      // Start of a new CREATE/ALTER POLICY.
      if (POLICY_LINE_RE.test(line)) {
        // If we were already inside one (no terminator), flush it first.
        if (inCreatePolicy) flushCreate()
        inCreatePolicy = true
        currentText = line
        currentLine = i + 1
        const nameMatch = line.match(POLICY_NAME_RE)
        if (nameMatch) currentName = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3]
        const tableMatch = line.match(ON_TABLE_RE)
        if (tableMatch) currentTable = tableMatch[1].toLowerCase()
        if (USING_TRUE_RE.test(line)) currentOpenWide = true
        if (TO_ANON_RE.test(line)) currentScopedAnon = true
        if (TO_SERVICE_ROLE_RE.test(line)) currentScopedServiceRole = true
      } else if (inCreatePolicy) {
        // Continuation line.
        currentText += `\n${line}`
        if (currentTable === null) {
          const tableMatch = line.match(ON_TABLE_RE)
          if (tableMatch) currentTable = tableMatch[1].toLowerCase()
        }
        if (USING_TRUE_RE.test(line)) currentOpenWide = true
        if (TO_ANON_RE.test(line)) currentScopedAnon = true
        if (TO_SERVICE_ROLE_RE.test(line)) currentScopedServiceRole = true
      }

      if (terminator && inCreatePolicy) flushCreate()
    }
    // EOF flush.
    if (inCreatePolicy) flushCreate()
  }

  const findings: AuditFinding[] = []
  for (const policy of live.values()) {
    if (!policy.openWide) continue
    if (exempt.has(policy.table)) continue
    if (policy.table === '(unknown)') continue
    if (!dataBearing.test(policy.table)) continue
    // `USING (true) TO anon` is the canonical pattern for genuinely-public
    // data (landing-page reads). `USING (true) TO service_role` is harmless —
    // service_role bypasses RLS by design, so an explicit policy is redundant
    // but not dangerous. Both downgrade to warn rather than fail.
    const roleScoped = policy.scopedToAnon || policy.scopedToServiceRole
    const severity: AuditFinding['severity'] = roleScoped ? 'warn' : 'fail'
    let message: string
    if (policy.scopedToAnon) {
      message = `RLS policy "${policy.policyName}" is anon-scoped USING (true) on "${policy.table}" — verify this is intentional public-read`
    } else if (policy.scopedToServiceRole) {
      message = `RLS policy "${policy.policyName}" is service-role-scoped USING (true) on "${policy.table}" — redundant (service_role bypasses RLS) but harmless`
    } else {
      message = `RLS policy "${policy.policyName}" uses USING (true) on data-bearing table "${policy.table}"`
    }
    findings.push({
      severity,
      message,
      file: policy.file,
      line: policy.line,
      detail: policy.rawText.replace(/\s+/g, ' '),
    })
  }

  return {
    audit: 'rls',
    rule: 'R9',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}
