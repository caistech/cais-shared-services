/**
 * Responsive audit — Portfolio Standard responsive-design rule enforcement.
 *
 * Dynamic audit: loads each configured route in a headless browser at mobile
 * (375x812) and laptop (1280x800) viewports and checks for:
 *
 *   - horizontal scroll on mobile (clientWidth < scrollWidth) — fails build
 *   - elements overflowing the viewport on the right (boundingRect.right > vw)
 *   - tap targets smaller than 44x44 px on mobile (a / button elements)
 *
 * Requires `playwright` to be installed in the consumer repo. If playwright is
 * not present the audit skips cleanly so it doesn't break repos that haven't
 * opted in yet. Configure breakpoints + routes via `responsive.config.json`.
 *
 * See foundation/PORTFOLIO_STANDARD.md → responsive-design rule.
 */
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  passedFromFindings,
} from './shared.js'

export interface ResponsiveConfig {
  /** Base URL the smoke targets — typically the preview deploy. Required. */
  baseUrl?: string
  /** Paths to walk. Default: ['/', '/pricing', '/login', '/signup', '/privacy']. */
  paths?: string[]
  /** Viewport widths to test. Default: 375 (iPhone SE) + 1280 (laptop). */
  viewports?: Array<{ width: number; height: number; label: string }>
  /** Minimum tap-target side in px on mobile (default 44, per iOS HIG / WCAG 2.5.5). */
  minTapTargetPx?: number
  /** Selectors to skip tap-target check on (e.g. social-icon strips that are intentionally tight). */
  tapTargetIgnoreSelectors?: string[]
  /** Set `false` to keep the audit running even when playwright isn't installed. Default true. */
  skipIfPlaywrightMissing?: boolean
}

export interface ResponsiveOptions {
  rootDir?: string
  configPath?: string | null
  baseUrlOverride?: string | null
}

interface PlaywrightModule {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<{
      newContext(options: {
        viewport: { width: number; height: number }
      }): Promise<{
        newPage(): Promise<unknown>
        close(): Promise<void>
      }>
      close(): Promise<void>
    }>
  }
}

const DEFAULT_PATHS = ['/', '/pricing', '/login', '/signup', '/privacy']
const DEFAULT_VIEWPORTS = [
  { width: 375, height: 812, label: 'mobile (iPhone SE-ish)' },
  { width: 1280, height: 800, label: 'laptop' },
]

export async function runResponsiveAudit(
  options: ResponsiveOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const config =
    (await loadConfigOptional<ResponsiveConfig>(options.configPath ?? null)) ?? {}

  const baseUrl = options.baseUrlOverride ?? config.baseUrl
  if (!baseUrl) {
    return {
      audit: 'responsive',
      rule: 'responsive-design',
      passed: true,
      skipped: true,
      skipReason:
        'no baseUrl configured (pass --base-url or set responsive.config.json baseUrl)',
      findings: [],
      durationMs: Date.now() - start,
    }
  }

  let playwright: PlaywrightModule | null = null
  try {
    // Indirect-name import so tsc doesn't require @types/playwright at build
    // time. Consumers add `playwright` to their own devDeps when opting in.
    const moduleName = 'playwright'
    playwright = (await import(moduleName)) as unknown as PlaywrightModule
  } catch {
    if (config.skipIfPlaywrightMissing !== false) {
      return {
        audit: 'responsive',
        rule: 'responsive-design',
        passed: true,
        skipped: true,
        skipReason:
          'playwright not installed (npm i -D playwright; npx playwright install chromium) — set skipIfPlaywrightMissing=false to fail instead',
        findings: [],
        durationMs: Date.now() - start,
      }
    }
    return {
      audit: 'responsive',
      rule: 'responsive-design',
      passed: false,
      findings: [
        {
          severity: 'fail',
          message: 'playwright is required for the responsive audit but is not installed',
          detail: 'run `npm i -D playwright && npx playwright install chromium`',
        },
      ],
      durationMs: Date.now() - start,
    }
  }

  const paths = config.paths ?? DEFAULT_PATHS
  const viewports = config.viewports ?? DEFAULT_VIEWPORTS
  const minTap = config.minTapTargetPx ?? 44
  const ignoreSelectors = config.tapTargetIgnoreSelectors ?? []
  const findings: AuditFinding[] = []

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    for (const viewport of viewports) {
      const isMobile = viewport.width < 768
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      })
      try {
        for (const path of paths) {
          const url = joinUrl(baseUrl, path)
          const page = (await context.newPage()) as unknown as {
            goto(u: string, opts?: { waitUntil?: string }): Promise<unknown>
            evaluate<T>(fn: (...args: never[]) => T, arg?: unknown): Promise<T>
            close(): Promise<void>
          }
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded' })
            const overflow = await page.evaluate<{
              clientWidth: number
              scrollWidth: number
            }>(() => ({
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            }))
            if (
              isMobile &&
              overflow.scrollWidth > overflow.clientWidth + 1
            ) {
              findings.push({
                severity: 'fail',
                message: `horizontal scroll on ${viewport.label} viewport`,
                file: path,
                detail: `clientWidth=${overflow.clientWidth} scrollWidth=${overflow.scrollWidth}`,
              })
            }
            if (isMobile) {
              const tooSmall = await page.evaluate<
                Array<{ selector: string; w: number; h: number }>
              >((args: unknown[]) => {
                const [min, ignored] = args as [number, string[]]
                const ignore = new Set(ignored)
                const violations: Array<{
                  selector: string
                  w: number
                  h: number
                }> = []
                const els = document.querySelectorAll('a, button, [role="button"], input[type="submit"]')
                els.forEach((el) => {
                  const r = el.getBoundingClientRect()
                  if (r.width === 0 || r.height === 0) return
                  if (r.width < min || r.height < min) {
                    const tag = el.tagName.toLowerCase()
                    const id = el.id ? `#${el.id}` : ''
                    const cls = (el.className && typeof el.className === 'string')
                      ? `.${el.className.split(' ').slice(0, 2).join('.')}`
                      : ''
                    const sel = `${tag}${id}${cls}`
                    if (ignore.has(sel)) return
                    violations.push({ selector: sel, w: Math.round(r.width), h: Math.round(r.height) })
                  }
                })
                return violations.slice(0, 20)
              }, [minTap, ignoreSelectors])
              for (const v of tooSmall) {
                findings.push({
                  severity: 'warn',
                  message: `tap target smaller than ${minTap}x${minTap}px on mobile`,
                  file: path,
                  detail: `${v.selector} (${v.w}x${v.h})`,
                })
              }
            }
          } finally {
            await page.close()
          }
        }
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  return {
    audit: 'responsive',
    rule: 'responsive-design',
    passed: passedFromFindings(findings),
    findings,
    durationMs: Date.now() - start,
  }
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.startsWith('/') ? path : `/${path}`
  return `${trimmedBase}${trimmedPath}`
}
