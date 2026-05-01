#!/usr/bin/env bash
# scripts/onboard-new-project.sh
#
# Onboard a new portfolio project: append it to portfolio-manifest.yaml
# (canonical) and to the various bash-script project lists (operational),
# then print remaining manual steps.
#
# Usage:
#   bash scripts/onboard-new-project.sh <github-repo> <vercel-slug> [supabase-project-ref]
#
# Example:
#   bash scripts/onboard-new-project.sh HairStylistAI hair-stylist-ai pkzbpzzgrxjebdmwfsmg
#
# This script DOES:
#   - Verify the Vercel project exists and resolve its prj_ id
#   - Optionally verify the Supabase project ref
#   - Append a project entry to portfolio-manifest.yaml (preserving comments)
#   - Append the project to all 6 hardcoded lists in scripts/*.sh
#   - Run the audit to confirm the manifest still parses
#
# This script DOES NOT:
#   - Create the Vercel project (do that at https://vercel.com/new)
#   - Create the Supabase project (do that via Supabase dashboard or Management API)
#   - Set env vars on Vercel beyond what the existing token-propagation
#     scripts already handle
#   - Commit or push changes (review them, then commit yourself)
#
# This is a stop-gap until @caistech/portfolio-env-sync v0.8 lands a
# proper interactive wizard. See Issue #6.

set -euo pipefail

GH_REPO="${1:-}"
VERCEL_SLUG="${2:-}"
SUPABASE_REF="${3:-}"

if [ -z "$GH_REPO" ] || [ -z "$VERCEL_SLUG" ]; then
  cat <<EOF >&2
Usage: $0 <github-repo> <vercel-slug> [supabase-project-ref]

  github-repo            Case-sensitive GitHub repo name (e.g. HairStylistAI)
  vercel-slug            Vercel project slug (e.g. hair-stylist-ai)
  supabase-project-ref   Optional: 20-char Supabase project ref

Example:
  $0 HairStylistAI hair-stylist-ai pkzbpzzgrxjebdmwfsmg
EOF
  exit 1
fi

# Resolve hub root regardless of where the user invoked from
HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$HUB_ROOT/portfolio-manifest.yaml"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found" >&2
  exit 1
fi

# Resolve Vercel token
if [ -z "${VERCEL_TOKEN:-}" ] && [ -f "$HOME/.vercel-token" ]; then
  VERCEL_TOKEN=$(cat "$HOME/.vercel-token")
fi
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "ERROR: VERCEL_TOKEN unset and ~/.vercel-token missing" >&2
  echo "  Set one of: export VERCEL_TOKEN=...  or  echo 'TOKEN' > ~/.vercel-token" >&2
  exit 1
fi

TEAM="team_hwN7IFtd2Fo3DCj9C67ZwI1t"

# 1. Verify Vercel project exists
echo "== Verifying Vercel project '$VERCEL_SLUG' =="
proj_resp=$(curl -sS \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/$VERCEL_SLUG?teamId=$TEAM")

vercel_id=$(echo "$proj_resp" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    pid = d.get('id', '')
    print(pid if pid.startswith('prj_') else '')
except Exception:
    pass
")

if [ -z "$vercel_id" ]; then
  err_msg=$(echo "$proj_resp" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('error', {}).get('message', 'unknown'))
except Exception:
    print('parse-error')
")
  echo "ERROR: Vercel project '$VERCEL_SLUG' not found: $err_msg" >&2
  echo "  Create it first at https://vercel.com/new" >&2
  exit 1
fi
echo "  ✓ $VERCEL_SLUG → $vercel_id"

# 2. Optionally verify Supabase project ref
if [ -n "$SUPABASE_REF" ]; then
  echo ""
  echo "== Verifying Supabase project '$SUPABASE_REF' =="
  if [ -z "${SUPABASE_MANAGEMENT_TOKEN:-}" ]; then
    echo "  ⚠ SUPABASE_MANAGEMENT_TOKEN unset — skipping verification (entry still recorded)"
  else
    sb_status=$(curl -sS -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
      "https://api.supabase.com/v1/projects/$SUPABASE_REF")
    if [ "$sb_status" = "200" ]; then
      echo "  ✓ $SUPABASE_REF (HTTP 200)"
    else
      echo "  ⚠ Supabase ref returned HTTP $sb_status — recording anyway, fix manually"
    fi
  fi
fi

# 3. Append to portfolio-manifest.yaml
echo ""
echo "== Updating portfolio-manifest.yaml =="
node "$HUB_ROOT/scripts/_onboard-append-manifest.mjs" \
  "$MANIFEST" "$VERCEL_SLUG" "$vercel_id" "$SUPABASE_REF"

# 4. Append to bash script lists
echo ""
echo "== Updating bash-script project lists =="
python "$HUB_ROOT/scripts/_onboard-update-bash-lists.py" \
  "$HUB_ROOT" "$GH_REPO" "$VERCEL_SLUG"

# 5. Sanity-audit: re-parse the manifest by running the env-sync audit
#    against ONLY the new project. Catches YAML corruption immediately.
echo ""
echo "== Sanity-checking manifest by auditing '$VERCEL_SLUG' =="
if [ -f "$HUB_ROOT/packages/portfolio-env-sync/dist/index.js" ]; then
  VERCEL_TOKEN="$VERCEL_TOKEN" \
    node "$HUB_ROOT/packages/portfolio-env-sync/dist/index.js" \
    --manifest "$MANIFEST" --repo "$VERCEL_SLUG" 2>&1 | sed 's/^/  /' || true
else
  echo "  ⚠ portfolio-env-sync not built; skipping audit"
  echo "    (run: npm run build --workspace=@caistech/portfolio-env-sync)"
fi

# 6. Print remaining manual steps
cat <<EOF

== Done. Remaining manual steps for '$VERCEL_SLUG' ==

  1. Review the diff:
       cd $HUB_ROOT && git diff portfolio-manifest.yaml scripts/

  2. Propagate GITHUB_PACKAGES_TOKEN to the new project's .env.local +
     Vercel envs (uses the existing script):
       bash scripts/set-caistech-token.sh \$GH_PAT \$VERCEL_TOKEN

  3. If the project uses Supabase, set Auth Site URL + Redirect URLs
     on the Supabase dashboard (or via Management API).
     Tracked: Issue #11.

  4. Set portfolio-wide secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY,
     RESEND_API_KEY) on Vercel manually until Issue #10 lands.

  5. Run a full audit to confirm zero drift:
       export VERCEL_TOKEN=\$(cat ~/.vercel-token)
       node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml

  6. Commit and push:
       git add portfolio-manifest.yaml scripts/
       git commit -m "feat(onboard): add $VERCEL_SLUG"
       git push
EOF
