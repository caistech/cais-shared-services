#!/usr/bin/env node
/**
 * patch-node-auth-token.mjs
 *
 * Switch deployed gate.yml files from the home-rolled
 * "Configure @caistech registry auth" + repo-.npmrc approach to the
 * official setup-node@v4 `registry-url` + `scope` + `NODE_AUTH_TOKEN`
 * pattern. The home-rolled `${GITHUB_PACKAGES_TOKEN}` substitution in
 * repo-local .npmrc has been unreliable in CI (causes 401s on @caistech
 * package downloads). NODE_AUTH_TOKEN via setup-node is the official
 * supported path.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

// --- Old setup-node block (without registry-url) ---
const OLD_SETUP = `      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: \${{ steps.detect-pm.outputs.pm }}`

const NEW_SETUP = `      # Setup Node with built-in @caistech registry auth (official pattern).
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: \${{ steps.detect-pm.outputs.pm }}
          registry-url: 'https://npm.pkg.github.com'
          scope: '@caistech'`

// --- Old Configure step + Install env block ---
const OLD_CONFIGURE_AND_INSTALL = `      # Write the @caistech registry auth into ~/.npmrc BEFORE install.
      # The repo-local .npmrc uses \`\${GITHUB_PACKAGES_TOKEN}\` syntax which is
      # supposed to be expanded by npm/pnpm — but the expansion has been
      # unreliable in CI (npm sends the literal placeholder string, GitHub
      # rejects it as "unauthenticated"). Writing the literal token via bash
      # \`>>\` is the robust path: bash always expands env vars.
      - name: Configure @caistech registry auth
        run: |
          mkdir -p ~
          {
            echo "@caistech:registry=https://npm.pkg.github.com"
            echo "//npm.pkg.github.com/:_authToken=\${GITHUB_PACKAGES_TOKEN}"
          } >> ~/.npmrc
        env:
          GITHUB_PACKAGES_TOKEN: \${{ secrets.CAISTECH_PACKAGES_TOKEN }}

      - name: Install dependencies
        run: |
          if [ -f pnpm-lock.yaml ]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
        env:
          GITHUB_PACKAGES_TOKEN: \${{ secrets.CAISTECH_PACKAGES_TOKEN }}`

const NEW_INSTALL = `      - name: Install dependencies
        run: |
          if [ -f pnpm-lock.yaml ]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
        env:
          NODE_AUTH_TOKEN: \${{ secrets.CAISTECH_PACKAGES_TOKEN }}`

// --- Older pre-Configure-step shape (Install with GITHUB_PACKAGES_TOKEN env only) ---
const OLDER_INSTALL = `      - name: Install dependencies
        run: |
          if [ -f pnpm-lock.yaml ]; then
            corepack enable
            pnpm install --frozen-lockfile
          elif [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
        env:
          GITHUB_PACKAGES_TOKEN: \${{ secrets.CAISTECH_PACKAGES_TOKEN }}`

for (const path of argv.slice(2)) {
  let text = readFileSync(path, 'utf8')
  let changed = false

  if (text.includes('NODE_AUTH_TOKEN')) {
    console.log(`SKIP (already on NODE_AUTH_TOKEN): ${path}`)
    continue
  }

  if (text.includes(OLD_SETUP)) {
    text = text.replace(OLD_SETUP, NEW_SETUP)
    changed = true
  }

  if (text.includes(OLD_CONFIGURE_AND_INSTALL)) {
    text = text.replace(OLD_CONFIGURE_AND_INSTALL, NEW_INSTALL)
    changed = true
  } else if (text.includes(OLDER_INSTALL)) {
    text = text.replace(OLDER_INSTALL, NEW_INSTALL)
    changed = true
  }

  if (changed) {
    writeFileSync(path, text, 'utf8')
    console.log(`PATCHED: ${path}`)
  } else {
    console.log(`NO MATCH: ${path}`)
  }
}
