/**
 * Shared utilities for v0.2 audits.
 *
 * Every audit returns an `AuditResult` with the same shape so the master
 * `audit-all` runner can aggregate them. Each audit is self-contained — failure
 * of one shouldn't block others when running individually.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Structured outcome of a single audit. The `passed` flag drives exit code;
 * `findings` carries human-readable + machine-readable detail per violation.
 */
export interface AuditResult {
  /** Audit identifier (e.g. 'rls', 'vendor-leak'). Matches the CLI subcommand. */
  audit: string
  /** Portfolio Standard rule this audit enforces (e.g. 'R9'). */
  rule: string
  /** Pass = no findings (or all findings are warnings). */
  passed: boolean
  /** True if the audit was skipped (opt-out config) — still counts as pass. */
  skipped?: boolean
  /** Why the audit was skipped, if any. */
  skipReason?: string
  /** All findings — `severity: 'fail'` is what flips `passed` to false. */
  findings: AuditFinding[]
  /** Wall-clock duration in ms. */
  durationMs: number
}

export interface AuditFinding {
  /** 'fail' fails the build; 'warn' is informational. */
  severity: 'fail' | 'warn'
  /** Short human-readable description of the violation. */
  message: string
  /** File path relative to the repo root, if applicable. */
  file?: string
  /** 1-indexed line number, if applicable. */
  line?: number
  /** Free-form extra detail (matched text, expected value, etc.). */
  detail?: string
}

/**
 * Load a config module from disk. Mirrors the v0.1 CLI pattern:
 *   - `.json` → JSON.parse
 *   - `.ts` / `.js` / `.mjs` → dynamic import with default OR `config` export
 *
 * Returns `null` if the file doesn't exist (audit falls back to defaults).
 */
export async function loadConfigOptional<T>(configPath: string | null): Promise<T | null> {
  if (!configPath) return null
  const absolute = resolve(process.cwd(), configPath)
  try {
    await stat(absolute)
  } catch {
    return null
  }
  if (absolute.endsWith('.json')) {
    const raw = await readFile(absolute, 'utf8')
    return JSON.parse(raw) as T
  }
  const mod = (await import(pathToFileURL(absolute).href)) as {
    default?: T
    config?: T
  }
  const config = mod.default ?? mod.config
  if (!config) {
    throw new Error(
      `config at ${configPath} must export a default or named 'config' object`
    )
  }
  return config
}

/**
 * Recursively walk a directory and yield all file paths. Skips the standard
 * ignored directories (node_modules, dist, .next, etc.) unless the caller
 * overrides via `extraIgnore`.
 */
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'out',
  '_archive',
  '_vite-legacy',
  '.git',
  '.vercel',
  'coverage',
  '.gate-snapshots',
])

export async function walkFiles(
  root: string,
  options: { extraIgnore?: Set<string>; extensions?: string[] } = {}
): Promise<string[]> {
  const ignore = new Set([...DEFAULT_IGNORE_DIRS, ...(options.extraIgnore ?? [])])
  const allowedExts = options.extensions
  const out: string[] = []
  await walk(root, root, ignore, allowedExts, out)
  return out
}

async function walk(
  root: string,
  current: string,
  ignore: Set<string>,
  allowedExts: string[] | undefined,
  acc: string[]
): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      if (ignore.has(entry.name)) continue
      await walk(root, full, ignore, allowedExts, acc)
    } else if (entry.isFile()) {
      if (allowedExts && !allowedExts.some((ext) => entry.name.endsWith(ext))) continue
      acc.push(full)
    }
  }
}

/**
 * Read a file with a friendly fallback — returns `null` if the file is missing
 * or unreadable rather than throwing.
 */
export async function readFileOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Convert an absolute path to a repo-relative one for display.
 */
export function relativeTo(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/')
}

/**
 * Default human-readable formatter for an AuditResult. Mirrors the v0.1
 * `formatRouteResult` / `formatAuthResult` style.
 */
export function formatAuditResult(result: AuditResult): string {
  const lines: string[] = []
  const status = result.skipped ? 'SKIP' : result.passed ? 'PASS' : 'FAIL'
  const counts = result.skipped
    ? `(skipped: ${result.skipReason ?? 'opted out'})`
    : `(${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}, ${result.durationMs}ms)`
  lines.push(`[portfolio-gate] ${result.audit} (${result.rule}): ${status} ${counts}`)
  for (const finding of result.findings) {
    const tag = finding.severity === 'fail' ? 'FAIL' : 'WARN'
    const loc = finding.file
      ? ` ${finding.file}${finding.line ? `:${finding.line}` : ''}`
      : ''
    const detail = finding.detail ? ` — ${finding.detail}` : ''
    lines.push(`  ${tag}${loc}: ${finding.message}${detail}`)
  }
  return lines.join('\n')
}

/**
 * Determine pass/fail from a list of findings — 'fail' severity flips it.
 */
export function passedFromFindings(findings: AuditFinding[]): boolean {
  return findings.every((f) => f.severity !== 'fail')
}
