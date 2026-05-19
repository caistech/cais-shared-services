#!/usr/bin/env node
/**
 * patch-pnpm-aware-gate.mjs
 *
 * Patches the deployed gate.yml in pnpm-using repos so the Setup Node step
 * doesn't fail on "Dependencies lock file is not found" (it was looking for
 * package-lock.json with `cache: npm` even though the repo only has
 * pnpm-lock.yaml).
 *
 * Adds a detect-pm step + conditional pnpm setup, switches cache key to be
 * dynamic. Idempotent: skips files that already have the detect-pm step.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const OLD = `      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm`

const NEW = `      # Detect package manager so the cache step + install step use the
      # right tooling. Pnpm workspaces (TourLingo, NDISSDA, F2K trio) need
      # pnpm/action-setup before setup-node can use the \`cache: pnpm\` key.
      - name: Detect package manager
        id: detect-pm
        run: |
          if [ -f pnpm-lock.yaml ]; then
            echo "pm=pnpm" >> $GITHUB_OUTPUT
          else
            echo "pm=npm" >> $GITHUB_OUTPUT
          fi

      - name: Setup pnpm
        if: steps.detect-pm.outputs.pm == 'pnpm'
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: \${{ steps.detect-pm.outputs.pm }}`

for (const path of argv.slice(2)) {
  const text = readFileSync(path, 'utf8')
  if (text.includes('detect-pm')) {
    console.log(`SKIP (already patched): ${path}`)
    continue
  }
  if (!text.includes(OLD)) {
    console.log(`NO MATCH: ${path}`)
    continue
  }
  writeFileSync(path, text.replace(OLD, NEW), 'utf8')
  console.log(`PATCHED: ${path}`)
}
