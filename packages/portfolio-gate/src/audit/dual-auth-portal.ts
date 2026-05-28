/**
 * Dual-auth portal audit — Portfolio Standard §8.5 enforcement.
 *
 * Products with an auth gate must ship TWO separate auth flows and UIs:
 * - Admin portal (operator control panel at /admin/*)
 * - User portal (end-user functional UI)
 *
 * This is required for VALIDATION - the operator needs to see if validation
 * is succeeding (users signing up, activity, metrics).
 *
 * See: PRODUCT_STANDARDS.md → §8.5 DUAL-AUTH PORTAL.
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

export interface DualAuthPortalConfig {
  adminRoutes?: string[]
  userRoutes?: string[]
  scanRoots?: string[]
}

export interface DualAuthPortalOptions {
  rootDir?: string
  configPath?: string | null
}

const DEFAULT_ADMIN_ROUTES = ['/admin/login', '/admin/', '/admin/dashboard']
const DEFAULT_USER_ROUTES = ['/login', '/signup', '/signup/', '/login/']

export async function runDualAuthPortalAudit(
  options: DualAuthPortalOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<DualAuthPortalConfig>(
      options.configPath ??
        resolve(rootDir, 'dual-auth-portal.config.json')
    )) ?? {}

  const adminRoutes = config.adminRoutes ?? DEFAULT_ADMIN_ROUTES
  const userRoutes = config.userRoutes ?? DEFAULT_USER_ROUTES
  const scanRoots = config.scanRoots ?? ['.']
  const findings: AuditFinding[] = []

  const files: string[] = []
  for (const root of scanRoots) {
    const absoluteRoot = `${rootDir}/${root}`.replace(/\\/g, '/')
    const found = await walkFiles(absoluteRoot, { extensions: ['.tsx', '.jsx'] })
    files.push(...found)
  }

  // Find pages in app directory (handle both Windows \\ and Unix / paths)
  const appPages = files.filter(f => 
    (f.includes('/app/') || f.includes('\\app\\')) && 
    (f.endsWith('page.tsx') || f.endsWith('page.jsx'))
  )
  const relPages = appPages.map(f => relativeTo(rootDir, f).replace(/\\/g, '/'))

  // Check for admin routes
  const hasAdminLogin = relPages.some(p => p.includes('/admin/login') || p.includes('/admin/signin'))
  const hasAdminRoutes = relPages.some(p => p.startsWith('/admin/') || p.includes('/(admin)/') || p.includes('/admin\\'))
  const hasAdminLayout = files.some(f => relativeTo(rootDir, f).replace(/\\/g, '/').includes('/admin/layout'))

  // Check for user routes
  const hasUserLogin = relPages.some(p => 
    (p.includes('/login') || p.includes('/signin') || p.includes('/auth/login')) && !p.includes('/admin')
  )
  const hasUserSignup = relPages.some(p => 
    (p.includes('/signup') || p.includes('/register') || p.includes('/auth/signup')) && !p.includes('/admin')
  )
  const hasUserRoutes = relPages.filter(p => 
    (p.endsWith('/page.tsx') || p.endsWith('/index.tsx')) && 
    !p.includes('/admin') && 
    !p.includes('/(auth)/') &&
    !p.includes('/auth/')
  ).length > 0

  // Check for landing page with dual CTAs
  const landingPages = relPages.filter(p => 
    p === '/page.tsx' || 
    p === '/index.tsx' || 
    p.endsWith('/welcome/page.tsx') ||
    p.endsWith('/welcome/index.tsx')
  )

  let landingHasDualCTAs = false
  for (const landing of landingPages) {
    const content = await readFileOptional(landing.replace(rootDir, ''))
    if (content) {
      const hasAdminCTA = /admin\s*login|admin\s*sign\s*in|admin\s*start/i.test(content)
      const hasUserCTA = /user\s*sign\s*up|user\s*login|start\s*as\s*user|sign\s*up.*user/i.test(content)
      if (hasAdminCTA && hasUserCTA) {
        landingHasDualCTAs = true
        break
      }
    }
  }

  // Check for admin middleware/protection
  const middlewareFiles = files.filter(f => f.includes('middleware'))
  let hasAdminProtection = false
  for (const m of middlewareFiles) {
    const content = await readFileOptional(m)
    if (content && /admin|ADMIN/.test(content)) {
      hasAdminProtection = true
      break
    }
  }

  // Check layout files for admin structure
  const layoutFiles = files.filter(f => f.includes('/layout.tsx') || f.includes('/layout.jsx'))
  const hasAdminLayoutFile = layoutFiles.some(f => 
    relativeTo(rootDir, f).replace(/\\/g, '/').includes('/admin/')
  )

  // Findings
  if (!landingHasDualCTAs && landingPages.length > 0) {
    findings.push({
      severity: 'fail',
      message: 'landing page must have TWO distinct CTAs: "Admin Login" and "User Sign Up/Login"',
      file: landingPages[0] || 'src/app/page.tsx',
    })
  }

  if (!hasAdminLogin) {
    findings.push({
      severity: 'fail',
      message: 'missing /admin/login page - admin auth flow required (§8.5)',
      file: 'src/app/admin/login/page.tsx',
    })
  }

  if (!hasUserLogin) {
    findings.push({
      severity: 'fail',
      message: 'missing user login page - user auth flow required',
      file: 'src/app/login/page.tsx',
    })
  }

  if (!hasUserSignup) {
    findings.push({
      severity: 'fail',
      message: 'missing user signup page - user auth flow required',
      file: 'src/app/signup/page.tsx',
    })
  }

  const passed = findings.length === 0

  return {
    audit: 'dual-auth-portal',
    rule: '§8.5',
    passed,
    findings,
    durationMs: Date.now() - start,
  }
}
