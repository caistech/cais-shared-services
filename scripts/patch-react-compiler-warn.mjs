#!/usr/bin/env node
/**
 * patch-react-compiler-warn.mjs
 *
 * Add a `react-compiler/react-compiler: warn` rule downgrade to an existing
 * eslint config file. Supports flat config (eslint.config.mjs/.js) and
 * legacy config (.eslintrc.json).
 *
 * Run: node patch-react-compiler-warn.mjs <config-file> ...
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const FLAT_INSERTION_AFTER = '  ...nextTs,'
const FLAT_INSERTION = `  ...nextTs,
  {
    // TEMPORARY (2026-05-19 — portfolio migration): downgrade react-compiler
    // rule from error to warn. Pattern firing across the portfolio for
    // pre-existing setState-in-useEffect uses; per-repo fixes deferred.
    rules: {
      "react-compiler/react-compiler": "warn",
    },
  },`

for (const path of argv.slice(2)) {
  const text = readFileSync(path, 'utf8')

  if (text.includes('react-compiler')) {
    console.log(`SKIP (already has react-compiler rule): ${path}`)
    continue
  }

  if (path.endsWith('.json')) {
    // Legacy .eslintrc.json — merge rules object.
    const parsed = JSON.parse(text)
    parsed.rules = parsed.rules ?? {}
    parsed.rules['react-compiler/react-compiler'] = 'warn'
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    console.log(`PATCHED (json): ${path}`)
  } else if (text.includes(FLAT_INSERTION_AFTER)) {
    // Flat config with the expected nextTs spread — surgical insert.
    writeFileSync(path, text.replace(FLAT_INSERTION_AFTER, FLAT_INSERTION), 'utf8')
    console.log(`PATCHED (flat): ${path}`)
  } else {
    console.log(`NO MATCH: ${path}`)
  }
}
