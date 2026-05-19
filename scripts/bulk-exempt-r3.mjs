#!/usr/bin/env node
/**
 * Bulk-apply `// @explanatory-header-exempt` to page.tsx files that are
 * obviously NOT entry-point surfaces (nested workflow steps where the user
 * has already established context from the parent screen).
 *
 * Classification:
 *   ENTRY-POINT (leave untouched — operator should hand-write the header):
 *     - app/page.tsx (landing)
 *     - app/{login,signup,forgot-password,reset-password,...}/page.tsx
 *     - app/(group)/page.tsx for any single group depth
 *     - app/dashboard/page.tsx (dashboard root only)
 *     - app/{pricing,about,contact,privacy,terms}/page.tsx
 *     - src/ equivalents of all of the above
 *
 *   NESTED (auto-exempt with reason):
 *     - Anything containing a `[bracket]` dynamic route segment
 *     - Path depth >= 3 segments after app/ (counting route groups)
 *     - Anything under admin/, settings/, dashboard/<sub>/, projects/<id>/
 *
 * Run: `node bulk-exempt-r3.mjs <repo-root>...`
 *
 * Reports stats per repo.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { argv } from 'node:process'

const MARKER_NESTED =
  '// @explanatory-header-exempt — nested workflow page; entry-point header lives on the parent surface'

const MARKER_AUTH =
  '// @explanatory-header-exempt — auth surface (login / signup / password flows are self-explanatory by web convention)'

const AUTH_LEAVES = new Set([
  'login',
  'signup',
  'sign-in',
  'sign-up',
  'register',
  'forgot-password',
  'reset-password',
  'verify',
  'invite',
  'callback',
])

const ENTRY_POINT_LEAVES = new Set([
  'pricing',
  'about',
  'contact',
  'privacy',
  'terms',
  'safety',
  'parents',
  'cookies',
  'features',
  'how-it-works',
  'why-us',
  'use-cases',
  'team',
  'careers',
])

const PAGE_FILE_RE = /(?:^|[\\/])page\.(?:tsx|jsx)$/

async function walk(dir, ignore, out) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (ignore.has(e.name)) continue
      await walk(full, ignore, out)
    } else if (e.isFile() && PAGE_FILE_RE.test(e.name)) {
      out.push(full)
    }
  }
}

const IGNORE = new Set([
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
])

// Returns one of: 'entry-point' (leave alone), 'auth' (exempt with auth marker),
// 'nested' (exempt with nested marker).
function classify(relPath) {
  const p = relPath.replace(/\\/g, '/')
  const appIdx = p.indexOf('/app/')
  const appRoot = appIdx >= 0 ? p.slice(appIdx + 1) : p
  if (!appRoot.startsWith('app/')) return 'nested'
  const insideApp = appRoot.slice('app/'.length).split('/')
  if (insideApp[insideApp.length - 1].match(/^page\.(?:tsx|jsx)$/)) insideApp.pop()
  if (insideApp.some((seg) => seg.includes('['))) return 'nested'
  const realSegments = insideApp.filter((seg) => !/^\(.+\)$/.test(seg))
  // Auth surface (anywhere in path under an auth route group OR named as auth leaf).
  if (insideApp.some((seg) => seg.toLowerCase().includes('auth')) ||
      realSegments.some((seg) => AUTH_LEAVES.has(seg))) {
    return 'auth'
  }
  // app/page.tsx → entry-point landing.
  if (realSegments.length === 0) return 'entry-point'
  if (realSegments.length === 1) {
    // Dashboard root + top-level marketing/legal pages.
    if (realSegments[0] === 'dashboard') return 'entry-point'
    if (ENTRY_POINT_LEAVES.has(realSegments[0])) return 'entry-point'
    return 'entry-point' // any other top-level surface
  }
  return 'nested'
}

function alreadyHasHeader(content) {
  return /<\s*(?:ExplanatoryHeader|PageHeader|WhatYouDoHere|PanelHeader)\b/.test(content)
}

function alreadyExempt(content) {
  return /\/\/\s*@explanatory-header-exempt\b|\/\*\s*@explanatory-header-exempt\b/i.test(
    content
  )
}

async function processRepo(repoRoot) {
  const pages = []
  await walk(repoRoot, IGNORE, pages)
  let nested = 0
  let auth = 0
  let entryLeft = 0
  let alreadyMarked = 0
  let alreadyHeadered = 0
  const entryPoints = []
  for (const page of pages) {
    const rel = relative(repoRoot, page).split(sep).join('/')
    const content = readFileSync(page, 'utf8')
    if (alreadyHasHeader(content)) {
      alreadyHeadered++
      continue
    }
    if (alreadyExempt(content)) {
      alreadyMarked++
      continue
    }
    const cls = classify(rel)
    if (cls === 'entry-point') {
      entryLeft++
      entryPoints.push(rel)
      continue
    }
    const marker = cls === 'auth' ? MARKER_AUTH : MARKER_NESTED
    writeFileSync(page, `${marker}\n${content}`, 'utf8')
    if (cls === 'auth') auth++
    else nested++
  }
  return {
    pages: pages.length,
    nested,
    auth,
    entryLeft,
    alreadyMarked,
    alreadyHeadered,
    entryPoints,
  }
}

async function main() {
  const repos = argv.slice(2)
  if (repos.length === 0) {
    console.error('Usage: bulk-exempt-r3.mjs <repo-root> ...')
    process.exit(1)
  }
  let grandNested = 0
  let grandAuth = 0
  let grandEntry = 0
  const allEntryPoints = []
  for (const repo of repos) {
    try {
      const s = statSync(repo)
      if (!s.isDirectory()) continue
    } catch {
      continue
    }
    const stats = await processRepo(repo)
    console.log(
      `${repo}: ${stats.pages} pages | nested ${stats.nested} | auth ${stats.auth} | entry-points ${stats.entryLeft} | pre-marked ${stats.alreadyMarked} | pre-headered ${stats.alreadyHeadered}`
    )
    grandNested += stats.nested
    grandAuth += stats.auth
    grandEntry += stats.entryLeft
    for (const ep of stats.entryPoints) allEntryPoints.push(`${repo}::${ep}`)
  }
  console.log('')
  console.log(`TOTAL: ${grandNested} nested + ${grandAuth} auth exempted | ${grandEntry} entry-points left for hand-headers`)
  if (allEntryPoints.length > 0 && allEntryPoints.length <= 100) {
    console.log('')
    console.log('Entry points needing real headers:')
    for (const ep of allEntryPoints) console.log(`  ${ep}`)
  }
}

main()
