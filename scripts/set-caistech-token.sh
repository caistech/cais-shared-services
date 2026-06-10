#!/usr/bin/env bash
# set-caistech-token.sh
#
# Sets GITHUB_PACKAGES_TOKEN in three places:
#   1. Each portfolio repo's .env.local (for any app runtime that reads it)
#   2. Your ~/.npmrc (so local `pnpm install`/`npm install` resolves @caistech/*)
#   3. Each Vercel project's env vars (so Vercel builds resolve @caistech/*)
#
# Usage:
#   bash set-caistech-token.sh <GITHUB_PACKAGES_TOKEN> <VERCEL_API_TOKEN>
#
# Where:
#   GITHUB_PACKAGES_TOKEN — a GitHub PAT with read:packages scope
#   VERCEL_API_TOKEN      — a Vercel API token from https://vercel.com/account/tokens
#
# Running without VERCEL_API_TOKEN will skip step 3 (you can do that via dashboard).

set -euo pipefail

GH_TOKEN="${1:-}"
VERCEL_TOKEN="${2:-}"

if [ -z "$GH_TOKEN" ]; then
  echo "Usage: $0 <GITHUB_PACKAGES_TOKEN> [VERCEL_API_TOKEN]" >&2
  exit 1
fi

BASE="/c/Users/denni/PycharmProjects"
TEAM_ID="team_hwN7IFtd2Fo3DCj9C67ZwI1t"  # Corporate AI Solutions

# Repos with @caistech/* deps. `easy-claude-code` has its app at apps/frontend/.
REPOS=(
  MMCBuild
  DealFindrs
  F2K-Checkpoint
  property-services
  platform-trust
  universal-interviews
  LaunchReady
  Connexions
  Kira
  SmartBoard
  storefront-mcp
  RaiseReadyTemplate
  gbta-openclaw
  easy-claude-code
  HairStylistAI
  investorpilot
  PartnerPilot
  omq-outreach
  mmcbuild
  community-question-responder
  sayfix
  executorai
  pipeline
)

# Map GitHub repo folder → Vercel project slug (they differ in several cases)
declare -A VERCEL_SLUG=(
  [MMCBuild]=mmcbuild
  [DealFindrs]=deal-findrs
  [F2K-Checkpoint]=f2k-checkpoint-new
  [property-services]=property-services
  [platform-trust]=platform-trust
  [universal-interviews]=universal-interviews
  [LaunchReady]=launchready
  [Connexions]=connexions
  [Kira]=kira
  [SmartBoard]=smart-board
  [storefront-mcp]=storefront-mcp
  [RaiseReadyTemplate]=raiseready-template
  [gbta-openclaw]=gbta-openclaw
  [easy-claude-code]=easy-claude-code
  [HairStylistAI]=hair-stylist-ai
  [investorpilot]=investor-pilot
  [PartnerPilot]=partner-pilot
  [omq-outreach]=omq-outreach
  [mmcbuild]=mmcbuild
  [community-question-responder]=community-question-responder
  [sayfix]=sayfix
  [executorai]=executorai
  [pipeline]=pipeline
)

# --- Step 1: write .env.local per repo ----------------------------------------
echo "== Step 1: updating .env.local in each repo =="
for repo in "${REPOS[@]}"; do
  dir="$BASE/$repo"
  if [ ! -d "$dir" ]; then
    echo "  skip $repo (directory missing)"
    continue
  fi

  # Pick the right .env.local path
  if [ "$repo" = "easy-claude-code" ]; then
    envfile="$dir/apps/frontend/.env.local"
  else
    envfile="$dir/.env.local"
  fi

  # Ensure parent dir exists
  mkdir -p "$(dirname "$envfile")"

  # Touch if missing, then remove any old line and append fresh
  touch "$envfile"
  grep -v "^GITHUB_PACKAGES_TOKEN=" "$envfile" > "$envfile.tmp" || true
  mv "$envfile.tmp" "$envfile"
  echo "GITHUB_PACKAGES_TOKEN=$GH_TOKEN" >> "$envfile"
  echo "  ✓ $repo → $(realpath "$envfile")"
done

# --- Step 2: update ~/.npmrc so local npm installs work -----------------------
echo ""
echo "== Step 2: updating ~/.npmrc for local npm auth =="
NPMRC="$HOME/.npmrc"
touch "$NPMRC"

# Replace the @caistech registry + auth lines atomically
grep -v "^@caistech:registry=" "$NPMRC" | grep -v "^//npm.pkg.github.com/:_authToken=" > "$NPMRC.tmp" || true
mv "$NPMRC.tmp" "$NPMRC"
{
  echo "@caistech:registry=https://npm.pkg.github.com"
  echo "//npm.pkg.github.com/:_authToken=$GH_TOKEN"
} >> "$NPMRC"
echo "  ✓ ~/.npmrc updated (local pnpm/npm install will now resolve @caistech/*)"

# --- Step 3: set env var in each Vercel project ------------------------------
if [ -z "$VERCEL_TOKEN" ]; then
  echo ""
  echo "== Step 3: SKIPPED (no VERCEL_API_TOKEN provided) =="
  echo "  Add GITHUB_PACKAGES_TOKEN manually via https://vercel.com/<team>/<project>/settings/environment-variables"
  echo "  Or rerun: bash $0 $GH_TOKEN <VERCEL_API_TOKEN>"
  exit 0
fi

echo ""
echo "== Step 3: setting env var in each Vercel project =="

# Vercel REST API: POST /v10/projects/{idOrName}/env?teamId={teamId}
# Body: { "key": "GITHUB_PACKAGES_TOKEN", "value": "...", "type": "sensitive",
#         "target": ["production","preview"] }
# type=sensitive (post-April-2026): clears Vercel's "Needs Attention" flag by
# storing the token non-readable. Sensitive vars can't target development, so
# we scope to production+preview — local builds read it from ~/.npmrc (Step 2)
# and each repo's .env.local (Step 1), never from Vercel's development env.
for repo in "${REPOS[@]}"; do
  slug="${VERCEL_SLUG[$repo]}"
  [ -z "$slug" ] && { echo "  skip $repo (no Vercel slug mapped)"; continue; }

  # Remove any existing entry first (silently — 404 if not present is fine).
  # `|| true` keeps the script alive under `set -euo pipefail` when grep finds
  # no existing entry (the common case for a project that's never had the token
  # set). Without this the loop dies silently after the Step 3 header and the
  # token never gets propagated for any project that doesn't already have it.
  existing_id=$(curl -sS \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$slug/env?teamId=$TEAM_ID" 2>/dev/null \
    | grep -oE '"id"[[:space:]]*:[[:space:]]*"[^"]+"[[:space:]]*,[[:space:]]*"key"[[:space:]]*:[[:space:]]*"GITHUB_PACKAGES_TOKEN"' \
    | head -1 \
    | grep -oE '"[^"]+"' | head -1 | tr -d '"' || true)
  if [ -n "$existing_id" ]; then
    curl -sS -X DELETE \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/$slug/env/$existing_id?teamId=$TEAM_ID" >/dev/null 2>&1 || true
  fi

  # Create new
  response=$(curl -sS -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"GITHUB_PACKAGES_TOKEN\",\"value\":\"$GH_TOKEN\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
    "https://api.vercel.com/v10/projects/$slug/env?teamId=$TEAM_ID" 2>&1)

  if echo "$response" | grep -q '"error"'; then
    err=$(echo "$response" | grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1)
    echo "  ✗ $slug → $err"
  else
    echo "  ✓ $slug"
  fi
done

echo ""
echo "Done. Trigger a redeploy in Vercel (or push a commit) for the new env var to take effect."
