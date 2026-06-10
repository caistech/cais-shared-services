#!/usr/bin/env bash
# set-vercel-env-only.sh
#
# Sets GITHUB_PACKAGES_TOKEN in each Vercel project via REST API.
# Runs Step 3 of set-caistech-token.sh in isolation, more defensively.
#
# Usage:
#   bash set-vercel-env-only.sh <GITHUB_PACKAGES_TOKEN> <VERCEL_API_TOKEN>

# Do NOT use set -e here — we want to continue through partial failures.
GH_TOKEN="${1:-}"
VERCEL_TOKEN="${2:-}"

if [ -z "$GH_TOKEN" ] || [ -z "$VERCEL_TOKEN" ]; then
  echo "Usage: $0 <GITHUB_PACKAGES_TOKEN> <VERCEL_API_TOKEN>" >&2
  exit 1
fi

TEAM_ID="team_hwN7IFtd2Fo3DCj9C67ZwI1t"  # Corporate AI Solutions

SLUGS=(
  mmcbuild
  deal-findrs
  f2k-checkpoint-new
  property-services
  platform-trust
  universal-interviews
  launchready
  connexions
  kira
  smart-board
  storefront-mcp
  raiseready-template
  gbta-openclaw
  easy-claude-code
  hair-stylist-ai
  community-question-responder
  sayfix
  executorai
  pipeline
)

echo "== Setting GITHUB_PACKAGES_TOKEN in each Vercel project =="

# Build JSON body once.
# type=sensitive (not encrypted): since the April-2026 Vercel incident,
# plaintext-readable secrets are flagged "Needs Attention" in the dashboard.
# Sensitive values are non-readable once written, which clears the flag.
# Sensitive vars CANNOT target the development environment (the API rejects
# it), so we scope to production+preview. Local dev reads
# GITHUB_PACKAGES_TOKEN from ~/.npmrc and each repo's .env.local, never from
# Vercel's development env.
BODY=$(printf '{"key":"GITHUB_PACKAGES_TOKEN","value":"%s","type":"sensitive","target":["production","preview"]}' "$GH_TOKEN")

for slug in "${SLUGS[@]}"; do
  # 1. Check if this project exists at all
  proj_status=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$slug?teamId=$TEAM_ID" 2>/dev/null)

  if [ "$proj_status" != "200" ]; then
    echo "  ⊘ $slug (project not found, HTTP $proj_status — skipping)"
    continue
  fi

  # 2. Find any existing GITHUB_PACKAGES_TOKEN env entry to remove it
  envs_json=$(curl -sS \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$slug/env?teamId=$TEAM_ID" 2>/dev/null || echo '{}')

  # Extract id of GITHUB_PACKAGES_TOKEN entry if present.
  # Simple parsing — assumes no nested quoting oddities.
  existing_id=$(printf '%s' "$envs_json" \
    | python -c "import sys,json
try:
  data=json.load(sys.stdin)
  for e in data.get('envs',[]):
    if e.get('key')=='GITHUB_PACKAGES_TOKEN':
      print(e.get('id',''));break
except Exception:
  pass
" 2>/dev/null)

  if [ -n "$existing_id" ]; then
    curl -sS -X DELETE -o /dev/null \
      -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/$slug/env/$existing_id?teamId=$TEAM_ID" 2>/dev/null
  fi

  # 3. Create new env entry
  response=$(curl -sS -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "https://api.vercel.com/v10/projects/$slug/env?teamId=$TEAM_ID" 2>&1)

  if printf '%s' "$response" | grep -q '"error"'; then
    err=$(printf '%s' "$response" | python -c "import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get('error',{}).get('message','unknown error'))
except Exception:
  print('parse-error')
" 2>/dev/null)
    echo "  ✗ $slug → $err"
  else
    echo "  ✓ $slug"
  fi
done

echo ""
echo "Done. Trigger a redeploy in Vercel (or push a commit) for the new env var to take effect."
