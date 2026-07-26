#!/usr/bin/env bash
# set-caistech-token.sh
#
# Sets the @caistech registry token — under BOTH names, GITHUB_PACKAGES_TOKEN
# and NODE_AUTH_TOKEN (see the KEYS note below) — in three places:
#   1. Each portfolio repo's .env.local (for any app runtime that reads it)
#   2. Your ~/.npmrc (so local `pnpm install`/`npm install` resolves @caistech/*)
#   3. Each Vercel project's env vars (so Vercel builds resolve @caistech/*)
#
# Step 3 ALSO writes NPM_RC, and under pnpm 10+ that is the only one of the three Vercel keys that
# authenticates anything — the other two are orphaned there, because pnpm 10 no longer expands
# ${NODE_AUTH_TOKEN} in a committed project .npmrc. See the NPM_RC_CONTENT note below for the full
# story, including why the build cache hid it. Rotating the PAT rotates NPM_RC with it, since the
# file content embeds a literal copy.
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

# BOTH names are written everywhere, deliberately.
#
# The portfolio is mid-migration from the home-rolled repo-local .npmrc
# `${GITHUB_PACKAGES_TOKEN}` substitution to setup-node's NODE_AUTH_TOKEN
# (scripts/patch-node-auth-token.mjs). During that migration the two names
# coexist across repos, and rotating only one leaves the other stale — where
# "the other" is precisely the name a migrated repo actually reads. The symptom
# is a 401 at install that looks like a bad token rather than a missed rotation,
# which is the most expensive kind of wrong.
#
# An env var nothing reads is free. A stale one that IS read is an outage.
KEYS=(GITHUB_PACKAGES_TOKEN NODE_AUTH_TOKEN)

# NPM_RC — the key that actually AUTHENTICATES a Vercel install (added 2026-07-26).
#
# Both KEYS above are, on Vercel under pnpm 10+, orphaned. Their only consumer was the committed
# project .npmrc line `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`, and pnpm 10 stopped
# expanding environment variables in a PROJECT-level .npmrc — deliberately, because that file is
# committed. So the substitution the whole portfolio relies on became a silent no-op, and pushing
# the token under more names could never have fixed it.
#
# Nobody noticed because Vercel's build cache carries the pnpm store: a cached install never
# fetches from GitHub Packages and never authenticates. SayFix went eight consecutive green
# deploys that way; the first CACHE-LESS build failed with ERR_PNPM_FETCH_401, "No authorization
# header was set for the request".
#
# NPM_RC is Vercel's documented private-registry mechanism — its contents become ~/.npmrc at
# install time. That is USER level, where a LITERAL token IS honoured. Same mechanism that already
# works in GitHub Actions, where actions/setup-node writes a managed user-level .npmrc and installs
# succeed under this exact pnpm version.
#
# Vercel-only on purpose: locally, Step 2 already writes the literal token into ~/.npmrc, which is
# the same mechanism by a different route. There is nothing for NPM_RC to add in .env.local.
NPM_RC_CONTENT=$(printf '%s\n' \
  '@caistech:registry=https://npm.pkg.github.com' \
  "//npm.pkg.github.com/:_authToken=$GH_TOKEN" \
  'always-auth=true')

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
  # Added 2026-07-26. It was absent from this list while being present in
  # portfolio-manifest.yaml, so a rotation reported "Done" having never touched
  # it — and it produced no "skip" line either, so nothing said so out loud.
  # Its repo + Vercel project moved to CAS the same day, which is what made it
  # reachable from here at all.
  BucketLyst
)

# Map GitHub repo folder → Vercel project slug (they differ in several cases)
declare -A VERCEL_SLUG=(
  [MMCBuild]=mmcbuild-webapp
  [DealFindrs]=deal-findrs
  [F2K-Checkpoint]=f2k-checkpoint-new
  [property-services]=property-services
  [platform-trust]=platform-trust
  [universal-interviews]=universal-interviews
  [LaunchReady]=launch-ready
  [Connexions]=connexions
  [Kira]=kira
  [SmartBoard]=smart-board
  [storefront-mcp]=storefront-mcp
  [RaiseReadyTemplate]=raiseready-template
  [gbta-openclaw]=          # no Vercel project (verified 2026-07-26)
  [easy-claude-code]=easy-claude-code
  [HairStylistAI]=hair-stylist-ai
  [investorpilot]=investor-pilot
  [PartnerPilot]=partner-pilot
  [omq-outreach]=omq-outreach
  [mmcbuild]=mmcbuild-webapp
  [community-question-responder]=   # no Vercel project (verified 2026-07-26)
  [sayfix]=sayfix
  [executorai]=executorai
  [pipeline]=pipeline
  [BucketLyst]=bucketlyst
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
  for key in "${KEYS[@]}"; do
    grep -v "^$key=" "$envfile" > "$envfile.tmp" || true
    mv "$envfile.tmp" "$envfile"
    echo "$key=$GH_TOKEN" >> "$envfile"
  done
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
  echo "  Add GITHUB_PACKAGES_TOKEN, NODE_AUTH_TOKEN *and* NPM_RC manually via https://vercel.com/<team>/<project>/settings/environment-variables"
  echo "  NPM_RC is the one builds actually authenticate with under pnpm 10+; its value is the three-line .npmrc:"
  echo "    @caistech:registry=https://npm.pkg.github.com"
  echo "    //npm.pkg.github.com/:_authToken=<the PAT>"
  echo "    always-auth=true"
  echo "  Or rerun: bash $0 $GH_TOKEN <VERCEL_API_TOKEN>"
  exit 0
fi

echo ""
echo "== Step 3: setting env var in each Vercel project =="
FAILED=0
UPDATED=0
SKIPPED=0
DONE_SLUGS=""

# Vercel REST API: POST /v10/projects/{idOrName}/env?teamId={teamId}
# Body: { "key": "GITHUB_PACKAGES_TOKEN", "value": "...", "type": "sensitive",
#         "target": ["production","preview"] }
# type=sensitive (post-April-2026): clears Vercel's "Needs Attention" flag by
# storing the token non-readable. Sensitive vars can't target development, so
# we scope to production+preview — local builds read it from ~/.npmrc (Step 2)
# and each repo's .env.local (Step 1), never from Vercel's development env.

# Set ONE env var on ONE project: delete every existing row for the key, then create.
#
# Factored out because NPM_RC needs the identical delete-then-post handling but a DIFFERENT value,
# and the alternative — a second copy of this block — is how the two drift until only one of them
# has the 2026-07-26 delete fix.
#
# The payload is built by a JSON serialiser, not string interpolation: NPM_RC's value contains
# NEWLINES, which would produce invalid JSON inline. This also makes any future value containing a
# quote or backslash safe, which the old inline form was not.
#
# Returns 1 on error (and prints it) so the caller can mark the project failed.
set_vercel_env() {
  local slug="$1" key="$2" value="$3"
  local existing_ids eid payload response err

  existing_ids=$(KEY="$key" curl -sS \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$slug/env?teamId=$TEAM_ID" 2>/dev/null \
    | KEY="$key" node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);(j.envs||[]).filter(e=>e.key===process.env.KEY).forEach(e=>console.log(e.id))}catch{}})" || true)

  for eid in $existing_ids; do
    curl -sS -X DELETE \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/$slug/env/$eid?teamId=$TEAM_ID" >/dev/null 2>&1 || true
  done

  # Create new. DELETE-then-POST, never PATCH: a sensitive var is non-readable,
  # so an in-place update silently keeps the OLD value and nothing can read it
  # back to notice.
  payload=$(KEY="$key" VALUE="$value" node -e 'console.log(JSON.stringify({key:process.env.KEY,value:process.env.VALUE,type:"sensitive",target:["production","preview"]}))')

  response=$(curl -sS -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "https://api.vercel.com/v10/projects/$slug/env?teamId=$TEAM_ID" 2>&1)

  if echo "$response" | grep -q '"error"'; then
    err=$(echo "$response" | grep -oE '"message"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1)
    echo "  ✗ $slug [$key] → $err"
    return 1
  fi
  return 0
}

for repo in "${REPOS[@]}"; do
  slug="${VERCEL_SLUG[$repo]}"
  [ -z "$slug" ] && { echo "  skip $repo (no Vercel project)"; SKIPPED=$((SKIPPED+1)); continue; }

  # Two local repo folders can point at ONE Vercel project (MMCBuild + mmcbuild -> mmcbuild-webapp).
  # Without this, the second pass deletes and recreates what the first just wrote — harmless but
  # noisy, and before the delete was fixed it produced a guaranteed "already exists" failure.
  case " $DONE_SLUGS " in
    *" $slug "*) echo "  skip $repo (already handled as $slug)"; continue ;;
  esac
  DONE_SLUGS="$DONE_SLUGS $slug"

  # Remove any existing entry first (silently — 404 if not present is fine).
  # `|| true` keeps the script alive under `set -euo pipefail` when grep finds
  # no existing entry (the common case for a project that's never had the token
  # set). Without this the loop dies silently after the Step 3 header and the
  # token never gets propagated for any project that doesn't already have it.
  # FIXED 2026-07-26 — this is the mechanism behind a month of failed deploys.
  # The old code found the entry with a grep whose final stage was
  #     grep -oE '"[^"]+"' | head -1
  # which returns the FIRST quoted token of the match — the literal field name "id", NOT the
  # id's value. So it issued DELETE /env/id, got a 404 that `|| true` swallowed, and the POST
  # then failed with "already exists". Every project that already had the token silently kept
  # its OLD value — which is why GITHUB_PACKAGES_TOKEN sat unrotated on Vercel from 2026-06-11
  # while each run printed a column of ✗ and then "Done".
  # Parse JSON with a parser, and delete ALL matches (one key can have several target rows).
  project_failed=0
  for key in "${KEYS[@]}"; do
    set_vercel_env "$slug" "$key" "$GH_TOKEN" || project_failed=1
  done

  # The one that actually authenticates the install (see NPM_RC_CONTENT above). Written LAST so a
  # partially-updated project still reads as failed on the summary line below.
  set_vercel_env "$slug" NPM_RC "$NPM_RC_CONTENT" || project_failed=1

  # One line per PROJECT, not per key — a project counts as updated only when
  # every key landed, so a half-written project can never read as a success.
  if [ "$project_failed" -eq 0 ]; then
    echo "  ✓ $slug"
    UPDATED=$((UPDATED+1))
  else
    FAILED=$((FAILED+1))
  fi
done

echo ""
echo "Vercel: $UPDATED updated, $FAILED failed, $SKIPPED skipped (no project)."
if [ "$FAILED" -gt 0 ]; then
  # Never print "Done" over a pile of failures again. A propagation that reported success while
  # updating nothing is exactly how the portfolio ran on a stale token for six weeks.
  echo "FAILED — $FAILED project(s) did NOT receive the new token. Fix and re-run before relying on it." >&2
  exit 1
fi
if [ "$UPDATED" -eq 0 ]; then
  echo "FAILED — no Vercel project was updated, so nothing was propagated." >&2
  exit 1
fi
echo "Done. Trigger a redeploy in Vercel (or push a commit) for the new env var to take effect."
