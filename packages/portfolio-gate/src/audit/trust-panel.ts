/**
 * Trust panel audit — Portfolio Standard R15 enforcement.
 *
 * Static analysis: REGULATED-tier products must surface a `<TrustPanel/>`
 * (from `@caistech/corporate-components/trust`) on at least one top-level
 * surface. The audit only runs when the consumer opts in via
 * `trust-panel.config.json` declaring the product is regulated — STANDARD-tier
 * products that don't need this skip the audit cleanly.
 *
 * See foundation/PORTFOLIO_STANDARD.md → R15.
 */
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
  readFileOptional,
  relativeTo,
  walkFiles,
} from './shared.js'

export interface TrustPanelConfig {
  /**
   * Risk tier of this product. Audit only fires for `regulated` and
   * `regulated-financial`. Anything else is treated as opt-out (audit skipped
   * with `passed: true`).
   */
  tier?: 'standard' | 'revenue' | 'regulated' | 'regulated-financial'
  /**
   * Regex of JSX tag names that satisfy the requirement. Default:
   * `TrustPanel|RegulatedFooter|ComplianceFooter`. Extend if your product has
   * its own subclass.
   */
  componentNameRegex?: string
  /**
   * Glob-ish prefixes that count as "top-level surfaces" — typically the home
   * page, /pricing, /contact, /about, the dashboard root. If the trust panel
   * appears in ANY file under these prefixes the audit passes. Defaults to
   * `app/` and `app/(marketing)/`.
   */
  surfaceRoots?: string[]
}

export interface TrustPanelOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_COMPONENT_REGEX = 'TrustPanel|RegulatedFooter|ComplianceFooter'
const DEFAULT_SURFACE_ROOTS = ['app']

export async function runTrustPanelAudit(
  options: TrustPanelOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<TrustPanelConfig>(options.configPath ?? null)) ?? {}

  const tier = config.tier ?? 'standard'
  if (tier !== 'regulated' && tier !== 'regulated-financial') {
    return {
      audit: 'trust-panel',
      rule: 'R15',
      passed: true,
      skipped: true,
      skipReason: `tier is "${tier}" — R15 only applies to regulated / regulated-financial products`,
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  const componentRe = new RegExp(
    `<\\s*(?:${config.componentNameRegex ?? DEFAULT_COMPONENT_REGEX})\\b`
  )
  const surfaceRoots = config.surfaceRoots ?? DEFAULT_SURFACE_ROOTS

  let foundAt: string | null = null
  for (const root of surfaceRoots) {
    if (foundAt) break
    const absoluteRoot = `${rootDir}/${root}`.replace(/\\/g, '/')
    const files = await walkFiles(absoluteRoot, { extensions: ['.tsx', '.jsx'] })
    for (const file of files) {
      const content = await readFileOptional(file)
      if (!content) continue
      if (componentRe.test(content)) {
        foundAt = relativeTo(rootDir, file).replace(/\\/g, '/')
        break
      }
    }
  }

  const findings: AuditFinding[] = []
  if (!foundAt) {
    findings.push({
      severity: 'fail',
      message: `tier "${tier}" requires <TrustPanel/> on at least one surface under ${surfaceRoots.join(' / ')}`,
      detail: `no match for /${(
        config.componentNameRegex ?? DEFAULT_COMPONENT_REGEX
      ).replace(/\\/g, '/')}/`,
    })
  }

  return {
    audit: 'trust-panel',
    rule: 'R15',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}
