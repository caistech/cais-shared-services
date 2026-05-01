#!/usr/bin/env bash
# For each consumer repo: regenerate lockfile, commit, push.
# Detects pnpm vs npm by lockfile presence.

BASE=/c/Users/denni/PycharmProjects

ENTRIES=(
  "MMCBuild|."
  "DealFindrs|."
  "F2K-Checkpoint-Latest|."
  "property-services|."
  "platform-trust|."
  "Connexions|."
  "Kira|."
  "SmartBoard|."
  "LaunchReady|."
  "storefront-mcp|."
  "universal-interviews|."
  "RaiseReadyTemplate|."
  "gbta-openclaw|."
  "easy-claude-code|apps/frontend"
)

COMMIT_MSG='chore(deps): bump @caistech/* to compiled-dist versions

Hub packages now ship compiled .js + .d.ts instead of raw .ts source.
This fixes Turbopack ("Missing module type") and works cleanly with
webpack (no transpilePackages needed, though kept for safety).

Versions bumped:
- @caistech/platform-trust-middleware → ^0.3.0
- @caistech/property-services-sdk → ^0.2.0
- @caistech/coordination-sdk → ^0.3.0
- @caistech/nudge-core → ^0.2.0
- @caistech/mapbox → ^0.1.1
- @caistech/security-gate → ^0.2.0
- @caistech/agent-trust-score → ^0.2.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>'

for entry in "${ENTRIES[@]}"; do
  repo="${entry%|*}"
  subdir="${entry#*|}"
  rdir="$BASE/$repo"
  [ -d "$rdir" ] || continue

  cd "$rdir"
  wdir="$rdir"
  [ "$subdir" != "." ] && wdir="$rdir/$subdir"

  echo "=== $repo ==="

  cd "$wdir"
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --lockfile-only 2>&1 | tail -2
    lockfile="pnpm-lock.yaml"
  else
    npm install --package-lock-only --legacy-peer-deps 2>&1 | tail -2
    lockfile="package-lock.json"
  fi

  cd "$rdir"
  # Add package.json (relative) + lockfile
  if [ "$subdir" != "." ]; then
    git add "$subdir/package.json" "$subdir/$lockfile" 2>&1 | tail -1
  else
    git add "package.json" "$lockfile" 2>&1 | tail -1
  fi

  # Commit only if something changed
  if ! git diff --cached --quiet; then
    git commit -m "$COMMIT_MSG" 2>&1 | tail -2
    # Push (swallow "Everything up-to-date")
    push_result=$(git push origin main 2>&1 | tail -1)
    echo "  push: $push_result"
  else
    echo "  no changes to commit"
  fi
done

echo ""
echo "Done. Vercel will auto-redeploy each repo."
