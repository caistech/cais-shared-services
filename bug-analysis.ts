/**
 * Bug Analysis Program
 * 
 * Run: npx tsx bug-analysis.ts
 * 
 * Analyzes bug-knowledge.json to show:
 * - Bugs by product
 * - Bugs by pattern/category
 * - Fix success rates
 * - Common root causes
 * - Recommendations for improvement
 */

import { readFileSync } from 'fs'
import { join } from 'path'

interface BugEntry {
  id: string
  product: string
  error_pattern: string
  error_symptoms: string[]
  attempts: { what: string; result: string; reason?: string }[]
  solution: {
    approach: string
    code_path?: string
    key_change?: string
  }
  fixed_at: string
  fixed_by: string
}

interface BugKnowledge {
  entries: BugEntry[]
}

const BUG_FILE = join(__dirname, 'bug-knowledge.json')

function loadBugs(): BugEntry[] {
  const data = JSON.parse(readFileSync(BUG_FILE, 'utf-8')) as BugKnowledge
  return data.entries
}

function analyzeBugs(bugs: BugEntry[]) {
  console.log('\n' + '='.repeat(60))
  console.log('BUG ANALYSIS REPORT')
  console.log('='.repeat(60))

  // Bugs by product
  console.log('\n📦 BUGS BY PRODUCT')
  console.log('-'.repeat(40))
  const byProduct = bugs.reduce((acc, b) => {
    acc[b.product] = (acc[b.product] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  Object.entries(byProduct).sort((a, b) => b[1] - a[1]).forEach(([product, count]) => {
    console.log(`  ${product}: ${count} bugs`)
  })

  // Fix success rate
  console.log('\n✅ FIX SUCCESS RATE')
  console.log('-'.repeat(40))
  const fixed = bugs.filter(b => b.fixed_at).length
  const total = bugs.length
  console.log(`  Fixed: ${fixed}/${total} (${Math.round(fixed/total*100)}%)`)

  // Attempts analysis
  console.log('\n🔄 ATTEMPTS ANALYSIS')
  console.log('-'.repeat(40))
  const withAttempts = bugs.filter(b => b.attempts.length > 0)
  const noAttempts = bugs.filter(b => b.attempts.length === 0)
  console.log(`  Bugs with failed attempts before fix: ${withAttempts.length}`)
  console.log(`  Bugs fixed on first try: ${noAttempts.length}`)

  const failedAttempts = bugs.reduce((sum, b) => sum + b.attempts.filter(a => a.result === 'failed').length, 0)
  const totalAttempts = bugs.reduce((sum, b) => sum + b.attempts.length, 0)
  console.log(`  Failed attempts: ${failedAttempts}/${totalAttempts}`)

  // Common patterns
  console.log('\n🔍 DETECTED PATTERNS')
  console.log('-'.repeat(40))
  
  const patterns = [
    { name: 'Auth/Cookie issues', keywords: ['auth', 'cookie', 'logged in', 'session', 'credentials'] },
    { name: 'Environment variables', keywords: ['env', 'variable', 'Vercel'] },
    { name: 'Missing parameters', keywords: ['missing', 'not set', 'required'] },
    { name: 'Dry-run logic', keywords: ['dry_run', 'dry-run'] },
  ]

  patterns.forEach(pattern => {
    const matches = bugs.filter(b => 
      pattern.keywords.some(kw => 
        b.error_pattern.toLowerCase().includes(kw) ||
        b.error_symptoms.some(s => s.toLowerCase().includes(kw))
      )
    )
    if (matches.length > 0) {
      console.log(`  ${pattern.name}: ${matches.length} bugs`)
      matches.forEach(m => console.log(`    - ${m.id}: ${m.error_pattern.substring(0, 50)}`))
    }
  })

  // Root cause categories
  console.log('\n🎯 ROOT CAUSE CATEGORIES')
  console.log('-'.repeat(40))
  const rootCauses = [
    { category: 'Configuration', patterns: ['env', 'variable', 'Vercel', 'setting'] },
    { category: 'Code Logic', patterns: ['dry_run', 'default', 'conditional'] },
    { category: 'Auth/Session', patterns: ['auth', 'cookie', 'session', 'logged', 'credentials'] },
    { category: 'Missing Import', patterns: ['import', 'missing', 'export'] },
    { category: 'Data/Schema', patterns: ['table', 'column', 'schema', 'database'] },
  ]

  rootCauses.forEach(rc => {
    const count = bugs.filter(b => 
      rc.patterns.some(p => b.solution.approach?.toLowerCase().includes(p))
    ).length
    if (count > 0) {
      console.log(`  ${rc.category}: ${count}`)
    }
  })

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS')
  console.log('-'.repeat(40))
  
  // Most buggy products
  const topProduct = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0]
  if (topProduct && topProduct[1] > 2) {
    console.log(`  1. Focus QA on ${topProduct[0]} - has ${topProduct[1]} bugs`)
  }
  
  // Auth issues
  const authBugs = bugs.filter(b => 
    b.error_pattern.toLowerCase().includes('auth') || 
    b.error_pattern.toLowerCase().includes('logged')
  )
  if (authBugs.length > 1) {
    console.log(`  2. Standardize auth pattern - ${authBugs.length} auth-related bugs`)
  }
  
  // Missing tests
  const noTestBugs = bugs.filter(b => b.attempts.length === 0)
  if (noTestBugs.length > 0) {
    console.log(`  3. Add tests for ${noTestBugs.length} bugs that were fixed without test attempts`)
  }

  // Failed attempt patterns
  if (failedAttempts > 3) {
    console.log(`  4. Review debugging process - ${failedAttempts} failed attempts suggest better initial investigation needed`)
  }

  // Time-based analysis
  console.log('\n📅 TIMELINE')
  console.log('-'.repeat(40))
  const byMonth = bugs.reduce((acc, b) => {
    const month = b.fixed_at.substring(0, 7)
    acc[month] = (acc[month] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  Object.entries(byMonth).sort().forEach(([month, count]) => {
    console.log(`  ${month}: ${count} bugs fixed`)
  })

  console.log('\n' + '='.repeat(60))
}

const bugs = loadBugs()
analyzeBugs(bugs)
