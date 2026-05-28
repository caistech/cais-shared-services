/**
 * Responsive design audit — Portfolio Standard check #2.
 *
 * Must have responsive viewport meta tag and work at 375px and 1440px.
 * Checks for viewport meta tag and responsive design indicators.
 *
 * See: criteria.json → #2.
 */
import { resolve } from 'node:path'
import {
  type AuditFinding,
  type AuditResult,
  loadConfigOptional,
  readFileOptional,
  walkFiles,
} from './shared.js'

export interface ResponsiveConfig {
  checkViewport?: boolean
}

export interface ResponsiveOptions {
  rootDir?: string
  configPath?: string | null | undefined
  baseUrlOverride?: string | null
}

export async function runResponsiveAudit(
  options: ResponsiveOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<ResponsiveConfig>(
      options.configPath ??
        resolve(rootDir, 'responsive.config.json')
    )) ?? {}

  const findings: AuditFinding[] = []

  // Find HTML files or _document.tsx (handle Windows \ paths)
  const files = await walkFiles(rootDir, { extensions: ['.html', '.tsx', '.jsx'] })
  const htmlFiles = files.filter(f => 
    f.endsWith('.html') || 
    f.endsWith('/_document.tsx') || f.endsWith('\\\_document.tsx') ||
    f.endsWith('/_document.jsx') || f.endsWith('\\document.jsx')
  )

  // Check for viewport meta tag
  let hasViewport = false
  let checkedFiles = 0

  for (const file of htmlFiles) {
    if (checkedFiles > 3) break // Check first few files
    
    const content = await readFileOptional(file)
    if (!content) continue
    checkedFiles++

    // Check viewport meta in HTML or Next.js head
    if (content.includes('viewport') || content.includes('width=device-width')) {
      hasViewport = true
      break
    }
  }

  // Also check layout.tsx for Next.js export const viewport (handle Windows \ paths)
  const layoutFiles = files.filter(f => 
    f.includes('/layout.tsx') || f.includes('\\layout.tsx') ||
    f.includes('/layout.jsx') || f.includes('\\layout.jsx')
  )
  for (const file of layoutFiles.slice(0, 2)) {
    const content = await readFileOptional(file)
    if (content && (content.includes('export const viewport') || /viewport.*width.*device-width/i.test(content))) {
      hasViewport = true
      break
    }
  }

  if (!hasViewport && htmlFiles.length > 0) {
    findings.push({
      severity: 'fail',
      message: 'missing viewport meta tag - responsive design required',
      file: 'src/app/layout.tsx or pages/_document.tsx',
    })
  }

  return {
    audit: 'responsive',
    rule: '#2',
    passed: findings.length === 0,
    findings,
    durationMs: Date.now() - start,
  }
}
