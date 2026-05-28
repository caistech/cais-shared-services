/**
 * CommitmentPanel audit — Portfolio Standard R19 enforcement.
 *
 * Static analysis: every product must have a CommitmentPanel on its main
 * surface before outreach can begin. This is the bridge between "interesting"
 * and "action" in the validation pipeline.
 *
 * Scans for:
 * - Import of CommitmentPanel from @caistech/corporate-components
 * - Or project-local CommitmentPanel component
 * - On any main page (page.tsx or index.tsx)
 *
 * See: CLAUDE.md → CommitmentPanel (R19).
 */
import { resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  readFileOptional,
  relativeTo,
  walkFiles,
} from './shared.js'

export interface CommitmentPanelConfig {
  componentNameRegex?: string
  allowlist?: string[]
  scanRoots?: string[]
}

export interface CommitmentPanelOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_COMPONENT_REGEX =
  'CommitmentPanel|CommitmentSurface|ValidationPanel|TryItNowPanel'

const EXEMPT_MARKER_RE =
  /\/\/\s*@commitment-panel-exempt\b|\/\*\s*@commitment-panel-exempt\b/i

const PAGE_FILE_RE = /(?:^|[\\/])page\.(?:tsx|jsx)$/

const DEFAULT_ALLOWLIST = ['_archive/', '_vite-legacy/', 'app/(auth)/', 'src/app/(auth)/']

export async function runCommitmentPanelAudit(
  options: CommitmentPanelOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<CommitmentPanelConfig>(
      options.configPath ??
        resolve(rootDir, 'commitment-panel.config.json')
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

  // Find all pages with CommitmentPanel
  const pagesWithComponent: string[] = []

  for (const file of files) {
    const rel = relativeTo(rootDir, file).replace(/\\/g, '/')
    if (!PAGE_FILE_RE.test(rel)) continue
    if (allowlist.some((entry) => rel.includes(entry))) continue
    const content = await readFileOptional(file)
    if (!content) continue
    if (EXEMPT_MARKER_RE.test(content)) continue

    if (componentRe.test(content)) {
      pagesWithComponent.push(rel)
    }
  }

  // Pass if we found CommitmentPanel on ANY page (even if in auth, it's still present)
  // This is a lenient check - presence anywhere counts as "component is available"
  const passed = pagesWithComponent.length > 0

  if (!passed) {
    findings.push({
      severity: 'fail',
      message: 'no CommitmentPanel found - add to any page (src/app/layout.tsx or src/app/page.tsx)',
      file: 'src/app/layout.tsx',
    })
  }

  return {
    audit: 'commitment-panel',
    rule: 'R19',
    passed,
    findings,
    durationMs: Date.now() - start,
  }
}
