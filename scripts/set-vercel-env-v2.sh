#!/usr/bin/env bash
# Simple, dependency-free: pure bash + curl. No python, no jq.
# Usage: bash set-vercel-env-v2.sh <GH_PAT> <VERCEL_API_TOKEN>

GH="$1"
VT="$2"

if [ -z "$GH" ] || [ -z "$VT" ]; then
  echo "Usage: bash $0 <GH_PAT> <VERCEL_API_TOKEN>" >&2
  exit 1
fi

TEAM="team_hwN7IFtd2Fo3DCj9C67ZwI1t"

SLUGS="mmcbuild deal-findrs f2k-checkpoint-new property-services platform-trust universal-interviews launchready connexions kira smart-board storefront-mcp raiseready-template gbta-openclaw easy-claude-code hair-stylist-ai community-question-responder sayfix"

echo "== Adding GITHUB_PACKAGES_TOKEN to Vercel projects =="

for slug in $SLUGS; do
  # Single curl: POST env var. If it already exists, Vercel returns 409/400
  # which we surface without aborting the loop.
  # type=sensitive (post-April-2026): stores the token non-readable so Vercel
  # stops flagging it "Needs Attention". Sensitive vars can't target the
  # development env (API rejects it) — scope to production+preview; local
  # builds read the token from ~/.npmrc and .env.local.
  http=$(curl -sS -o /tmp/vercel_resp.$$ -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $VT" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"GITHUB_PACKAGES_TOKEN\",\"value\":\"$GH\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
    "https://api.vercel.com/v10/projects/$slug/env?teamId=$TEAM")

  body=$(cat /tmp/vercel_resp.$$ 2>/dev/null)
  rm -f /tmp/vercel_resp.$$

  case "$http" in
    200|201)
      echo "  OK  $slug (created)"
      ;;
    400|409)
      # Already exists — delete then re-create as sensitive. A PATCH can't
      # convert an encrypted var to sensitive (Vercel requires remove-and-
      # re-add), so we delete the existing entry and POST a fresh sensitive one.
      if echo "$body" | grep -q "ENV_ALREADY_EXISTS\|already exists"; then
        list=$(curl -sS -H "Authorization: Bearer $VT" \
          "https://api.vercel.com/v9/projects/$slug/env?teamId=$TEAM")
        # crude regex: find {"id":"...","key":"GITHUB_PACKAGES_TOKEN"...
        id=$(echo "$list" | tr '}' '\n' | grep '"key":"GITHUB_PACKAGES_TOKEN"' | head -1 | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
        if [ -n "$id" ]; then
          curl -sS -o /dev/null -X DELETE \
            -H "Authorization: Bearer $VT" \
            "https://api.vercel.com/v9/projects/$slug/env/$id?teamId=$TEAM"
          recreate_http=$(curl -sS -o /dev/null -w '%{http_code}' \
            -X POST \
            -H "Authorization: Bearer $VT" \
            -H "Content-Type: application/json" \
            -d "{\"key\":\"GITHUB_PACKAGES_TOKEN\",\"value\":\"$GH\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
            "https://api.vercel.com/v10/projects/$slug/env?teamId=$TEAM")
          if [ "$recreate_http" = "200" ] || [ "$recreate_http" = "201" ]; then
            echo "  OK  $slug (re-created sensitive)"
          else
            echo "  ERR $slug (re-create returned $recreate_http)"
          fi
        else
          echo "  ERR $slug (exists but id not found)"
        fi
      else
        echo "  ERR $slug (HTTP $http): $(echo "$body" | head -c 120)"
      fi
      ;;
    404)
      echo "  SKIP $slug (project not in Vercel)"
      ;;
    401|403)
      echo "  ERR $slug (HTTP $http — Vercel token lacks access to this team/project)"
      ;;
    *)
      echo "  ERR $slug (HTTP $http): $(echo "$body" | head -c 120)"
      ;;
  esac
done

echo ""
echo "Done. Trigger a redeploy in Vercel to pick up the new var."
