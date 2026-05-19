#!/usr/bin/env node
/**
 * Inject a warning-only `audit-all` step into deployed gate.yml files.
 * One-shot helper for the 2026-05-19 portfolio migration — once R3 + R14
 * backfill is done across the portfolio, revert the wrapper and remove this
 * script.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const MARKER = '      - name: Route smoke test (Portfolio Standard R13)'

const INJECTION = [
  '      # TEMPORARY (2026-05-19 — portfolio migration in progress):',
  '      # static audits emit warnings but DO NOT block the gate. Revert to',
  '      # blocking by removing the `|| ...` wrapper once the R3 explanatory-header',
  '      # + R14 sample-artefact backfill is done across the portfolio.',
  '      - name: Static audits (R3 / R9 / R11 / R14 / R15 — warning-only)',
  '        run: |',
  '          npx --no-install portfolio-gate-audit-all \\',
  '            --base-url "$PORTFOLIO_GATE_PREVIEW_URL" \\',
  '            || echo "::warning::Portfolio Standard audits found violations — see step output. Migration in progress; not blocking deploy. Revert this step to blocking once R3 + R14 backfill is complete."',
  '',
  MARKER,
].join('\n')

for (const path of argv.slice(2)) {
  const text = readFileSync(path, 'utf8')
  if (text.includes('portfolio-gate-audit-all')) {
    console.log(`SKIP (already has audit-all): ${path}`)
    continue
  }
  if (!text.includes(MARKER)) {
    console.log(`NO MARKER: ${path}`)
    continue
  }
  writeFileSync(path, text.replace(MARKER, INJECTION), 'utf8')
  console.log(`INJECTED: ${path}`)
}
