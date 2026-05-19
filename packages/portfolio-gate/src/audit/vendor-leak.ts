/**
 * Vendor identity leak audit — Portfolio Standard R11 enforcement.
 *
 * Static analysis: greps committed source for vendor-identity patterns
 * (operator's email handle, mobile number, Calendly slug, personal handles).
 * Ignores `node_modules/`, `dist/`, `.next/`, `out/`, `_archive/`,
 * `_vite-legacy/`, and any path listed in `vendor-leak.config.ts` allowlist
 * (operator-side scripts, internal docs).
 *
 * See foundation/PORTFOLIO_STANDARD.md → R11.
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

export interface VendorLeakConfig {
  /**
   * Patterns to flag. Each entry is `{ name, pattern }`. `pattern` is a string
   * compiled with the `i` flag. Add or replace via config — the defaults cover
   * the standard vendor-identity surface (operator handle, mobile, Calendly).
   */
  patterns?: VendorLeakPattern[]
  /**
   * Repo-relative paths to allowlist — those files may legitimately reference
   * vendor identity (e.g. the marketing site itself, operator-only scripts).
   * Glob-ish: a string is treated as a prefix match. To match an exact path,
   * keep it as-is.
   */
  allowlist?: string[]
  /**
   * Glob-ish prefixes to scan. If absent, the whole repo is scanned (minus
   * `DEFAULT_IGNORE_DIRS`). Useful to scope the audit to `app/`, `src/`, etc.
   */
  scanRoots?: string[]
}

export interface VendorLeakPattern {
  name: string
  pattern: string
}

export interface VendorLeakOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_PATTERNS: VendorLeakPattern[] = [
  { name: 'operator-handle', pattern: 'mcmdennis' },
  { name: 'operator-mobile', pattern: '\\+?61\\s?402\\s?612\\s?471' },
  { name: 'operator-calendly', pattern: 'calendly\\.com/mcmdennis' },
  {
    name: 'operator-email',
    pattern: 'dennis@corporateaisolutions',
  },
  { name: 'operator-instagram', pattern: 'karen\\.engel2026' },
]

const SCAN_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.html',
  '.css',
]

export async function runVendorLeakAudit(
  options: VendorLeakOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<VendorLeakConfig>(options.configPath ?? null)) ?? {}

  const patterns = (config.patterns ?? DEFAULT_PATTERNS).map((p) => ({
    name: p.name,
    re: new RegExp(p.pattern, 'i'),
  }))
  const allowlist = config.allowlist ?? []
  const findings: AuditFinding[] = []

  const scanDirs = (config.scanRoots ?? ['.']).map((p) => resolve(rootDir, p))
  const files: string[] = []
  for (const dir of scanDirs) {
    const found = await walkFiles(dir, { extensions: SCAN_EXTENSIONS })
    files.push(...found)
  }

  for (const file of files) {
    const rel = relativeTo(rootDir, file)
    if (isAllowlisted(rel, allowlist)) continue
    const content = await readFileOptional(file)
    if (!content) continue
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      for (const { name, re } of patterns) {
        const match = line.match(re)
        if (match) {
          findings.push({
            severity: 'fail',
            message: `vendor identity leak: ${name}`,
            file: rel,
            line: i + 1,
            detail: match[0],
          })
        }
      }
    }
  }

  return {
    audit: 'vendor-leak',
    rule: 'R11',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}

function isAllowlisted(relPath: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (entry === relPath) return true
    if (entry.endsWith('/')) return relPath.startsWith(entry)
    if (entry.endsWith('*')) return relPath.startsWith(entry.slice(0, -1))
    return relPath.startsWith(`${entry}/`)
  })
}
