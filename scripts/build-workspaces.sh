#!/usr/bin/env bash
#
# Build every workspace, in an order that actually works.
#
# WHY THIS EXISTS. `npm run build --workspaces` walks the workspace map
# ALPHABETICALLY, not topologically, so a package whose name sorts earlier than
# something it imports fails with `Cannot find module '@caistech/…'`. The repo's
# answer has always been "build the foundation packages by hand first", and that
# list lived inline in publish.yml.
#
# It now needs to exist in two workflows — publish and test — and a hand-curated
# ordering duplicated across two files is a list that will drift, silently, in
# the direction of the one nobody runs. So it lives here once and both call it.
#
# EXTEND THE LIST whenever a package becomes a dependency of an
# earlier-alphabetical sibling. The symptom is unmistakable: TS2307 on an
# @caistech import during "build all", naming the package that needed building
# first.
#
# TODO: this is what turborepo or pnpm's topological ordering would do for us.
# Worth migrating when the monorepo grows enough to justify it.
set -euo pipefail

# Leaf packages other workspaces import from, in dependency order.
FOUNDATION=(
  # coordination-sdk imports nudge-core; agent-trust-score imports security-gate.
  '@caistech/nudge-core'
  '@caistech/security-gate'
  # cais-au-compliance-mcp imports both of these.
  '@caistech/cert-extractor'
  '@caistech/sanctions-screen'
  # email-finder imports hunter-email.
  '@caistech/hunter-email'
  # corporate-components (0.5.1+) imports abn-lookup, mapbox and portfolio-env-sync.
  '@caistech/abn-lookup'
  '@caistech/mapbox'
  '@caistech/portfolio-env-sync'
  # Most products import corporate-components; build it before its consumers.
  '@caistech/corporate-components'
  # portfolio-gate imports @caistech/elevenlabs-convai/testing for the memory-loop
  # gate, and 'e' sorts before 'p' — but only in the ALL pass, which is too late
  # if anything earlier already needed portfolio-gate built.
  '@caistech/elevenlabs-convai'
  # portfolio-migrator's default template consumes portfolio-gate.
  '@caistech/portfolio-gate'
)

for pkg in "${FOUNDATION[@]}"; do
  echo "--- foundation: ${pkg}"
  npm run build --workspace="${pkg}" --if-present
done

echo "--- all workspaces"
npm run build --workspaces --if-present
