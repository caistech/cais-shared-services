/**
 * Explanatory header audit — Portfolio Standard R3 enforcement.
 *
 * Static analysis: every `page.tsx` / `page.jsx` file (the App Router page
 * convention) must either render `<ExplanatoryHeader/>` (or a project-local
 * subclass) OR carry an explicit `// @explanatory-header-exempt` comment
 * declaring the page is intentionally headerless.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R3.
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

export interface ExplanatoryHeaderConfig {
  /**
   * Regex matching the JSX tag name(s) that count as an explanatory header.
   * Defaults to `ExplanatoryHeader` plus common subclasses
   * (`ExplanatoryHeader` / `PageHeader` / `WhatYouDoHere`).
   */
  componentNameRegex?: string
  /**
   * Repo-relative path prefixes to skip. E.g. `app/(auth)/` if your auth
   * pages share an outer header and don't need a per-page one.
   */
  allowlist?: string[]
  /**
   * Glob-ish prefixes to scan. Default scans the whole repo minus
   * `DEFAULT_IGNORE_DIRS`. Most projects can leave this empty.
   */
  scanRoots?: string[]
}

export interface ExplanatoryHeaderOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_COMPONENT_REGEX =
  'ExplanatoryHeader|PageHeader|WhatYouDoHere|PanelHeader'

const EXEMPT_MARKER_RE =
  /\/\/\s*@explanatory-header-exempt\b|\/\*\s*@explanatory-header-exempt\b/i

const PAGE_FILE_RE = /(?:^|[\\/])page\.(?:tsx|jsx)$/

const DEFAULT_ALLOWLIST = ['_archive/', '_vite-legacy/']

export async function runExplanatoryHeaderAudit(
  options: ExplanatoryHeaderOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<ExplanatoryHeaderConfig>(
      options.configPath ?? resolve(rootDir, 'explanatory-header.config.json')
    )) ?? {}

  const componentRe = new RegExp(
    `<\\s*(?:${config.componentNameRegex ?? DEFAULT_COMPONENT_REGEX})\\b`
  )
  const allowlist = [...DEFAULT_ALLOWLIST, ...(config.allowlist ?? [])]
  const scanRoots = config.scanRoots ?? ['.']
  const findings: AuditFinding[] = []

  const files: string[] = []
  for (const root of scanRoots) {
    const absoluteRoot = `${rootDir}/${root}`.replace(/\\/g, '/')
    const found = await walkFiles(absoluteRoot, { extensions: ['.tsx', '.jsx'] })
    files.push(...found)
  }

  for (const file of files) {
    const rel = relativeTo(rootDir, file).replace(/\\/g, '/')
    if (!PAGE_FILE_RE.test(rel)) continue
    if (allowlist.some((entry) => rel.startsWith(entry))) continue
    const content = await readFileOptional(file)
    if (!content) continue
    if (EXEMPT_MARKER_RE.test(content)) continue
    if (componentRe.test(content)) continue
    findings.push({
      severity: 'fail',
      message:
        'page is missing <ExplanatoryHeader/>; add one or mark with `// @explanatory-header-exempt`',
      file: rel,
    })
  }

  return {
    audit: 'explanatory-header',
    rule: 'R3',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}
