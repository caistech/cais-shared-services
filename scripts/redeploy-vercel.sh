#!/usr/bin/env bash
# Redeploy the latest production deployment for each Vercel project.
# Use this after setting GITHUB_PACKAGES_TOKEN to trigger fresh builds.
#
# Usage: bash redeploy-vercel.sh <VERCEL_API_TOKEN>

VT="$1"
if [ -z "$VT" ]; then
  echo "Usage: bash $0 <VERCEL_API_TOKEN>" >&2
  exit 1
fi

TEAM="team_hwN7IFtd2Fo3DCj9C67ZwI1t"

# Only projects that we confirmed exist in Vercel (from set-vercel-env-v2 output).
SLUGS="mmcbuild deal-findrs f2k-checkpoint-new property-services platform-trust universal-interviews launchready connexions kira smart-board storefront-mcp raiseready-template gbta-openclaw easy-claude-code hair-stylist-ai community-question-responder sayfix executorai"

echo "== Triggering Vercel redeploys =="

for slug in $SLUGS; do
  # 1. Get the latest production deployment uid
  latest=$(curl -sS \
    -H "Authorization: Bearer $VT" \
    "https://api.vercel.com/v6/deployments?projectId=$slug&teamId=$TEAM&limit=1&target=production")

  uid=$(echo "$latest" | tr ',' '\n' | grep -m1 '"uid"' | sed -n 's/.*"uid":"\([^"]*\)".*/\1/p')

  if [ -z "$uid" ]; then
    echo "  SKIP $slug (no prior production deployment)"
    continue
  fi

  # 2. POST a redeploy using that deployment's git source
  http=$(curl -sS -o /tmp/rd_resp.$$ -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $VT" \
    -H "Content-Type: application/json" \
    -d "{\"deploymentId\":\"$uid\",\"name\":\"$slug\",\"target\":\"production\"}" \
    "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1")

  body=$(cat /tmp/rd_resp.$$ 2>/dev/null)
  rm -f /tmp/rd_resp.$$

  case "$http" in
    200|201)
      new_url=$(echo "$body" | tr ',' '\n' | grep -m1 '"url"' | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
      echo "  OK   $slug → https://$new_url"
      ;;
    *)
      msg=$(echo "$body" | tr ',' '\n' | grep -m1 '"message"' | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
      echo "  ERR  $slug (HTTP $http): ${msg:-$(echo "$body" | head -c 120)}"
      ;;
  esac
done

echo ""
echo "Watch status at https://vercel.com/corporate-ai-solutions"
