/**
 * Live RLS audit — Portfolio Standard R9, the runtime complement to the static
 * `rls.ts` migration audit.
 *
 * WHY: the static audit reads `supabase/migrations/*.sql` and flags over-permissive
 * `USING (true)` policies. It is BLIND to the two exposure modes that actually bit the
 * portfolio (2026-06):
 *   1. Drizzle `db:push` / dashboard-managed schemas — NO SQL migrations, so the static
 *      audit SKIPS and reports PASS on a database whose tables may have RLS entirely OFF
 *      (TenderWatch shipped users PII + encrypted portal credentials world-readable this way).
 *   2. Live drift — RLS toggled off in production after the migration that enabled it
 *      (an outreach `channels` table was on in code, off in prod).
 * This check queries the LIVE database and fails on any public table that is RLS-off AND
 * readable by the `anon` role (i.e. actually reachable by the public anon key in the bundle).
 *
 * Connection: Supabase Management API (`POST /v1/projects/{ref}/database/query`) — `fetch`
 * only, no Postgres-driver dependency, matching this package's zero-dep style. Degrades to
 * `skipped` when no project ref / token is configured (so un-wired repos don't fail the
 * build — they still get the static audit), and to a non-blocking `warn` when the call errors
 * (degrade-don't-fake: a check that can't run never reports a silent PASS).
 *
 * Config (rls.config.json, shared with the static audit):
 *   { "liveCheck": { "projectRef": "abcd1234..." }, "exemptTables": ["wind_regions"] }
 * The ref also resolves from SUPABASE_PROJECT_REF or the ref embedded in
 * NEXT_PUBLIC_SUPABASE_URL; the token from SUPABASE_ACCESS_TOKEN | SUPABASE_MANAGEMENT_TOKEN.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R9.
 */
import { resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
} from './shared.js'

export interface RlsLiveAuditConfig {
  liveCheck?: {
    /** Supabase project ref. Falls back to env (see module docs) if omitted. */
    projectRef?: string
  }
  /** Tables that are intentionally public (RLS-off by design) — downgraded to warn. */
  exemptTables?: string[]
}

export interface RlsLiveAuditOptions {
  /** Repo root. Defaults to `process.cwd()`. */
  rootDir?: string
  /** Override the path to the config file. */
  configPath?: string | null
}

interface TableRow {
  tablename: string
  rls_enabled: boolean
  anon_select: boolean
}

const MGMT_API = 'https://api.supabase.com'

const LIVE_RLS_QUERY = `
select
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') as anon_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
`.trim()

function resolveProjectRef(configRef?: string): string | null {
  if (configRef) return configRef
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (url) {
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
    if (match) return match[1]
  }
  return null
}

function resolveToken(): string | null {
  return (
    process.env.SUPABASE_ACCESS_TOKEN ??
    process.env.SUPABASE_MANAGEMENT_TOKEN ??
    null
  )
}

export async function runRlsLiveAudit(
  options: RlsLiveAuditOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<RlsLiveAuditConfig>(
      options.configPath ?? resolve(rootDir, 'rls.config.json')
    )) ?? {}

  const projectRef = resolveProjectRef(config.liveCheck?.projectRef)
  const token = resolveToken()
  const exempt = new Set((config.exemptTables ?? []).map((t) => t.toLowerCase()))

  const skip = (skipReason: string): AuditResult => ({
    audit: 'rls-live',
    rule: 'R9',
    passed: true,
    skipped: true,
    skipReason,
    findings: [],
    durationMs: Date.now() - start,
  })

  const warnResult = (message: string, detail?: string): AuditResult => ({
    audit: 'rls-live',
    rule: 'R9',
    passed: true,
    findings: [{ severity: 'warn', message, detail }],
    durationMs: Date.now() - start,
  })

  if (!projectRef) {
    return skip(
      'no Supabase project ref (set liveCheck.projectRef, SUPABASE_PROJECT_REF, or NEXT_PUBLIC_SUPABASE_URL)'
    )
  }
  if (!token) {
    return skip(
      'no Supabase management token (set SUPABASE_ACCESS_TOKEN or SUPABASE_MANAGEMENT_TOKEN)'
    )
  }

  let json: unknown
  try {
    const res = await fetch(
      `${MGMT_API}/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: LIVE_RLS_QUERY }),
      }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return warnResult(
        `live RLS check could not run (Management API ${res.status})`,
        body.slice(0, 200)
      )
    }
    json = await res.json()
  } catch (err) {
    return warnResult(
      `live RLS check could not run: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!Array.isArray(json)) {
    return warnResult('live RLS check returned an unexpected response shape')
  }
  const rows = json as TableRow[]

  const findings: AuditFinding[] = []
  for (const row of rows) {
    if (row.rls_enabled) continue
    const table = row.tablename.toLowerCase()
    if (exempt.has(table)) {
      findings.push({
        severity: 'warn',
        message: `table "${row.tablename}" has RLS disabled (exempt — declared intentionally public)`,
      })
      continue
    }
    if (row.anon_select) {
      findings.push({
        severity: 'fail',
        message: `table "${row.tablename}" has RLS DISABLED and is readable by the public anon key — live data exposure`,
        detail:
          'enable RLS + scoped policies, or add to exemptTables if intentionally public',
      })
    } else {
      findings.push({
        severity: 'warn',
        message: `table "${row.tablename}" has RLS disabled (anon cannot read it, but enable RLS for defense-in-depth)`,
      })
    }
  }

  return {
    audit: 'rls-live',
    rule: 'R9',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}
