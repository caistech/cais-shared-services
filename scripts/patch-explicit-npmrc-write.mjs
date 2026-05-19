#!/usr/bin/env node
/**
 * patch-explicit-npmrc-write.mjs
 *
 * Inject an explicit "Configure @caistech registry auth" step into deployed
 * gate.yml files that writes ~/.npmrc with the literal token via bash, BEFORE
 * the install step. Works around the `.npmrc` `${VAR}` interpolation
 * unreliability that causes "User cannot be authenticated with the token
 * provided" errors in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { argv } from 'node:process'

const MARKER = '      - name: Install dependencies'

const INJECTION = `      # Write the @caistech registry auth into ~/.npmrc BEFORE install.
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

${MARKER}`

for (const path of argv.slice(2)) {
  const text = readFileSync(path, 'utf8')
  if (text.includes('Configure @caistech registry auth')) {
    console.log(`SKIP (already patched): ${path}`)
    continue
  }
  if (!text.includes(MARKER)) {
    console.log(`NO MARKER: ${path}`)
    continue
  }
  writeFileSync(path, text.replace(MARKER, INJECTION), 'utf8')
  console.log(`PATCHED: ${path}`)
}
