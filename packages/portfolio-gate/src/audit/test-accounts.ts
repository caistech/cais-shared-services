import { type AuditResult, type AuditFinding, walkFiles, readFileOptional, loadConfigOptional } from './shared.js'
import { resolve } from 'path'
import { access } from 'fs/promises'

export interface TestAccountsConfig {
  adminEmails?: string[]
  testUserEmail?: string
}

export interface TestAccountsOptions {
  rootDir?: string
  configPath?: string
}

const DEFAULT_TEST_ACCOUNTS = {
  adminEmails: [
    'dennis@corporateaisolutions.com',
    'mcmdennis@gmail.com'
  ],
  testUserEmail: 'dennis@factory2key.com.au'
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function runTestAccountsAudit(
  options: TestAccountsOptions = {}
): Promise<AuditResult> {
  const start = Date.now()
  const rootDir = options.rootDir ?? process.cwd()
  const config =
    (await loadConfigOptional<TestAccountsConfig>(
      options.configPath ??
        resolve(rootDir, 'test-accounts.config.json')
    )) ?? {}

  const adminEmails = config.adminEmails ?? DEFAULT_TEST_ACCOUNTS.adminEmails
  const testUserEmail = config.testUserEmail ?? DEFAULT_TEST_ACCOUNTS.testUserEmail

  const findings: AuditFinding[] = []

  const envPath = resolve(rootDir, '.env.local')
  const envExamplePath = resolve(rootDir, '.env.example')
  const envProductionPath = resolve(rootDir, '.env.production')

  const envFiles = [envPath, envExamplePath, envProductionPath]
  let hasAdminEmails = false
  let hasTestUserEmail = false

  for (const envFile of envFiles) {
    if (await fileExists(envFile)) {
      const envContent = await readFileOptional(envFile) || ''
      if (envContent) {
        const hasAllAdmins = adminEmails.every(
          (email: string) => envContent.includes(email)
        )
        if (hasAllAdmins) hasAdminEmails = true

        if (envContent.includes(testUserEmail)) {
          hasTestUserEmail = true
        }
      }
    }
  }

  const files = await walkFiles(rootDir, { extensions: ['.ts', '.tsx', '.js', '.json'] })
  const configFiles = files.filter(f => 
    f.includes('/config/') || 
    f.includes('/constants/') ||
    f.includes('/lib/') ||
    f.endsWith('config.ts') ||
    f.endsWith('config.js') ||
    f.endsWith('constants.ts') ||
    f.endsWith('constants.js')
  )

  for (const file of configFiles.slice(0, 10)) {
    const content = await readFileOptional(file)
    if (content) {
      const hasAllAdmins = adminEmails.every(
        (email: string) => content.includes(email)
      )
      if (hasAllAdmins) hasAdminEmails = true

      if (content.includes(testUserEmail)) {
        hasTestUserEmail = true
      }
    }
  }

  if (!hasAdminEmails) {
    findings.push({
      severity: 'fail',
      message: `missing admin emails in config (${adminEmails.join(', ')}) - add to ADMIN_EMAILS env var`,
      file: '.env.local or config/constants',
    })
  }

  if (!hasTestUserEmail) {
    findings.push({
      severity: 'fail',
      message: `missing test user email (${testUserEmail}) - add to TEST_USER_EMAIL env var`,
      file: '.env.local or config/constants',
    })
  }

  return {
    audit: 'test-accounts',
    rule: 'TEST_ACCOUNTS',
    passed: findings.length === 0,
    findings,
    durationMs: Date.now() - start,
  }
}

export async function applyTestAccountsFix(
  options: TestAccountsOptions = {}
): Promise<{ fixed: string[], warnings: string[] }> {
  const rootDir = options.rootDir ?? process.cwd()
  const fixed: string[] = []
  const warnings: string[] = []

  const adminEmails = DEFAULT_TEST_ACCOUNTS.adminEmails
  const testUserEmail = DEFAULT_TEST_ACCOUNTS.testUserEmail

  const envPath = resolve(rootDir, '.env.local')
  const { readFile, writeFile } = await import('fs/promises')

  try {
    let envContent = ''
    try {
      envContent = await readFile(envPath, 'utf-8')
    } catch {
      // File doesn't exist, will create
    }

    if (!envContent.includes('ADMIN_EMAILS=')) {
      envContent += `\nADMIN_EMAILS=${adminEmails.join(',')}\n`
      fixed.push('Added ADMIN_EMAILS to .env.local')
    } else if (!adminEmails.every((email: string) => envContent.includes(email))) {
      warnings.push('ADMIN_EMAILS already exists - manually add missing emails')
    }

    if (!envContent.includes('TEST_USER_EMAIL=')) {
      envContent += `TEST_USER_EMAIL=${testUserEmail}\n`
      fixed.push('Added TEST_USER_EMAIL to .env.local')
    } else if (!envContent.includes(testUserEmail)) {
      warnings.push('TEST_USER_EMAIL already exists - manually update to ' + testUserEmail)
    }

    if (fixed.length > 0) {
      await writeFile(envPath, envContent)
    }
  } catch (err) {
    warnings.push(`Could not update .env.local: ${err}`)
  }

  return { fixed, warnings }
}
