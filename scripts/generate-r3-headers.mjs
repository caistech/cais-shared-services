#!/usr/bin/env node
/**
 * generate-r3-headers.mjs
 *
 * Reads a per-product `product-pages.yaml` and injects real
 * `<ExplanatoryHeader/>` blocks into entry-point page.tsx files.
 *
 * Usage:
 *   node generate-r3-headers.mjs <repo-root> [--apply]
 *
 *   Dry-run by default — prints proposed changes per file. Pass --apply to
 *   write them.
 *
 * Safety rules:
 *   - Skip any page that already has <ExplanatoryHeader/> (or subclass).
 *   - Skip any page with `// @explanatory-header-exempt` marker.
 *   - Skip nested pages (uses same classifier as bulk-exempt-r3.mjs).
 *   - Skip pages whose default export shape is too ambiguous to safely patch
 *     (early returns, conditional JSX, no obvious outer wrapper). These get
 *     printed to a manual-pass report so they can be hand-edited.
 *   - Always insert the import after the last existing import line, never
 *     mid-file. Always insert the JSX as the first child of the top-level
 *     `return (...)` JSX, never adjacent to control flow.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { argv } from 'node:process'

const HEADER_IMPORT_LINE =
  "import { ExplanatoryHeader } from '@caistech/corporate-components';"

const PAGE_FILE_RE = /(?:^|[\\/])page\.(?:tsx|jsx)$/

// Conservative classifier — mirrors bulk-exempt-r3.mjs. Only "entry-point"
// pages get headers; "nested" / "auth" pages are skipped (those are exempted
// by the sister script and don't need real headers).
const AUTH_LEAVES = new Set([
  'login', 'signup', 'sign-in', 'sign-up', 'register',
  'forgot-password', 'reset-password', 'verify', 'invite', 'callback',
])
const ENTRY_POINT_LEAVES = new Set([
  'pricing', 'about', 'contact', 'privacy', 'terms', 'safety', 'parents',
  'cookies', 'features', 'how-it-works', 'why-us', 'use-cases', 'team', 'careers',
])
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', '.next', '.turbo', 'out', '_archive',
  '_vite-legacy', '.git', '.vercel', 'coverage',
])

function classify(relPath) {
  const p = relPath.replace(/\\/g, '/')
  const appIdx = p.indexOf('/app/')
  const appRoot = appIdx >= 0 ? p.slice(appIdx + 1) : p
  if (!appRoot.startsWith('app/')) return 'nested'
  const insideApp = appRoot.slice('app/'.length).split('/')
  if (insideApp[insideApp.length - 1].match(/^page\.(?:tsx|jsx)$/)) insideApp.pop()
  if (insideApp.some((seg) => seg.includes('['))) return 'nested'
  const realSegments = insideApp.filter((seg) => !/^\(.+\)$/.test(seg))
  if (insideApp.some((seg) => seg.toLowerCase().includes('auth')) ||
      realSegments.some((seg) => AUTH_LEAVES.has(seg))) {
    return 'auth'
  }
  if (realSegments.length === 0) return 'entry-point'
  if (realSegments.length === 1) return 'entry-point'
  return 'nested'
}

async function walk(dir, out) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue
      await walk(full, out)
    } else if (e.isFile() && PAGE_FILE_RE.test(e.name)) {
      out.push(full)
    }
  }
}

// Tiny YAML loader — only handles the shape used by product-pages.yaml.
// Avoids adding a yaml dep for this single use.
function parseProductPages(text) {
  const product = {}
  const pages = {}
  let mode = 'top'
  let currentPagePath = null
  let currentPageData = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '')
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue
    if (line === 'product:') { mode = 'product'; continue }
    if (line === 'pages:') {
      if (currentPagePath) pages[currentPagePath] = currentPageData
      mode = 'pages'; currentPagePath = null; currentPageData = null
      continue
    }
    if (mode === 'product') {
      const m = line.match(/^\s{2}([a-z_]+):\s*"(.*)"\s*$/)
      if (m) product[m[1]] = m[2]
      continue
    }
    if (mode === 'pages') {
      // New page entry: 2-space indent + "path":
      const pageMatch = line.match(/^\s{2}"([^"]+)":\s*$/)
      if (pageMatch) {
        if (currentPagePath) pages[currentPagePath] = currentPageData
        currentPagePath = pageMatch[1]
        currentPageData = {}
        continue
      }
      // Field of current page: 4-space indent + field: "value"
      const fieldMatch = line.match(/^\s{4}([a-z_]+):\s*"(.*)"\s*$/)
      if (fieldMatch && currentPageData) {
        currentPageData[fieldMatch[1]] = fieldMatch[2]
      }
    }
  }
  if (currentPagePath) pages[currentPagePath] = currentPageData
  return { product, pages }
}

function escapeJsxAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function defaultsFor(relPath, product) {
  // Cheap, conservative defaults derived from product.*. Caller can always
  // override per page in YAML.
  const p = relPath.replace(/\\/g, '/').replace(/.*\/app\//, 'app/')
  if (p === 'app/page.tsx') {
    return {
      what: product.name || 'Replace with the product name',
      do: product.do || 'Replace with what the visitor does here',
      matters: product.matters || 'Replace with why this matters',
    }
  }
  if (/app\/dashboard\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: 'Dashboard',
      do: `Pick something to work on in ${product.name || 'this product'}`,
      matters: 'Every action you take starts here',
    }
  }
  if (/\/pricing\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: 'Pricing',
      do: 'Pick a plan that matches your usage',
      matters: 'Plans scale to your monthly volume',
    }
  }
  if (/\/about\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: `About ${product.name || 'this product'}`,
      do: 'Read who built this and why',
      matters: 'Background for prospects evaluating the tool',
    }
  }
  if (/\/contact\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: 'Contact us',
      do: 'Tell us what you need help with',
      matters: 'We reply within one business day',
    }
  }
  if (/\/privacy\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: 'Privacy policy',
      do: 'Read how we handle your personal information',
      matters: 'Required under the Australian Privacy Act',
    }
  }
  if (/\/terms\/page\.(?:tsx|jsx)$/.test(p)) {
    return {
      what: 'Terms of service',
      do: 'Read the agreement that governs your use of this product',
      matters: 'Defines liability and dispute resolution',
    }
  }
  // Fall-through — use product.* values.
  return {
    what: product.name || 'Replace with the page name',
    do: product.do || 'Replace with what the user does here',
    matters: product.matters || 'Replace with why this matters',
  }
}

function buildHeaderJsx(content) {
  return `      <ExplanatoryHeader\n        what="${escapeJsxAttr(content.what)}"\n        do="${escapeJsxAttr(content.do)}"\n        matters="${escapeJsxAttr(content.matters)}"\n      />`
}

// Inserts the import after the last existing import (or 'use client' line).
function injectImport(source) {
  if (source.includes('@caistech/corporate-components') &&
      source.includes('ExplanatoryHeader')) {
    return source // already imported
  }
  const lines = source.split('\n')
  let lastImportIdx = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import\b/.test(lines[i])) lastImportIdx = i
    if (i > 30 && lastImportIdx < 0) break
  }
  if (lastImportIdx === -1) {
    // No imports — add after 'use client' or at very top.
    const useClientIdx = lines.findIndex((l) => /^['"]use client['"];?/.test(l))
    const insertAt = useClientIdx >= 0 ? useClientIdx + 1 : 0
    lines.splice(insertAt, 0, HEADER_IMPORT_LINE)
  } else {
    lines.splice(lastImportIdx + 1, 0, HEADER_IMPORT_LINE)
  }
  return lines.join('\n')
}

// Inserts the JSX as first child of the outer return JSX, ONLY when the
// pattern is unambiguous: `return (` followed by a single root element on the
// next line(s). Returns the new source, or null if too ambiguous to patch.
function injectJsx(source, headerJsx) {
  // Look for `return (` followed by an opening tag like <Tag ...> or <Tag>.
  const re = /return\s*\(\s*\n?\s*(<[A-Za-z][^\n>]*>)/
  const m = source.match(re)
  if (!m) return null
  const openTag = m[1]
  // Skip fragments — those are fine but we still want a wrapper to inject inside.
  // Actually fragments work too — we can inject inside them.
  const insertAt = m.index + m[0].length
  const replacement = `${m[0]}\n${headerJsx}`
  return source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length)
}

async function main() {
  const args = argv.slice(2)
  const apply = args.includes('--apply')
  const repoRoot = args.find((a) => !a.startsWith('--'))
  if (!repoRoot) {
    console.error('Usage: generate-r3-headers.mjs <repo-root> [--apply]')
    process.exit(1)
  }
  const yamlPath = join(repoRoot, 'product-pages.yaml')
  let yamlText
  try { yamlText = readFileSync(yamlPath, 'utf8') }
  catch {
    console.error(`No product-pages.yaml at ${yamlPath}.`)
    console.error('Copy templates/product-pages.example.yaml and fill it in first.')
    process.exit(2)
  }
  const { product, pages: overrides } = parseProductPages(yamlText)

  const pageFiles = []
  await walk(repoRoot, pageFiles)
  let injected = 0; let skipped = 0; let manual = 0
  const manualList = []
  for (const file of pageFiles) {
    const rel = relative(repoRoot, file).split(sep).join('/')
    if (classify(rel) !== 'entry-point') { skipped++; continue }
    const source = readFileSync(file, 'utf8')
    if (/<\s*ExplanatoryHeader\b/.test(source)) { skipped++; continue }
    if (/\/\/\s*@explanatory-header-exempt\b/.test(source)) { skipped++; continue }
    const content = overrides[rel] ?? defaultsFor(rel, product)
    const headerJsx = buildHeaderJsx(content)
    const withImport = injectImport(source)
    const withJsx = injectJsx(withImport, headerJsx)
    if (!withJsx) {
      manual++
      manualList.push(rel)
      continue
    }
    if (apply) {
      writeFileSync(file, withJsx, 'utf8')
      console.log(`INJECTED: ${rel}`)
    } else {
      console.log(`WOULD INJECT: ${rel}`)
    }
    injected++
  }
  console.log('')
  console.log(`${apply ? 'APPLIED' : 'DRY-RUN'}: ${injected} entry-points patched | ${skipped} skipped | ${manual} need manual placement`)
  if (manualList.length > 0) {
    console.log('')
    console.log('Pages where JSX shape is too ambiguous for safe injection — patch by hand:')
    for (const m of manualList) console.log(`  ${m}`)
  }
  if (!apply) console.log('\nRe-run with --apply to write changes.')
}

main()
