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

# Vercel team. Defaults to Corporate AI Solutions (CAS) — the original
# portfolio team. Override via env when onboarding a project on a different
# team (e.g. mmcbuild moved to its own MMC Build team for blast-radius
# isolation):
#   export VERCEL_TEAM_ID="team_DquayrHfy4FCoeViJMWU7fIq"
#   export VERCEL_TEAM_SLUG="mmc-build"
TEAM="${VERCEL_TEAM_ID:-team_hwN7IFtd2Fo3DCj9C67ZwI1t}"
TEAM_SLUG="${VERCEL_TEAM_SLUG:-corporate-ai-solutions}"

# Auth callback path. Defaults to /api/auth/callback (the historical CAS
# pattern). Override for projects that use bare /auth/callback (e.g.
# mmcbuild):
#   export AUTH_CALLBACK_PATH="/auth/callback"
CALLBACK_PATH="${AUTH_CALLBACK_PATH:-/api/auth/callback}"

# Password-recovery path. Separate from the sign-in callback because
# Supabase's URI allow list requires exact match including query strings:
# putting `?redirect=/reset-password` on the callback URL breaks the
# wildcard match, and Supabase falls back to the Site URL root. Use a
# dedicated /auth/recover (or /api/auth/recover) path so the path itself
# encodes the intent without needing query strings.
#   export AUTH_RECOVER_PATH="/auth/recover"   (mmcbuild)
#   export AUTH_RECOVER_PATH="/api/auth/recover"  (CAS pattern, default)
RECOVER_PATH="${AUTH_RECOVER_PATH:-/api/auth/recover}"

# Resolve Supabase Management API token (env first, then ~/.supabase-token)
if [ -z "${SUPABASE_MANAGEMENT_TOKEN:-}" ] && [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  SUPABASE_MANAGEMENT_TOKEN="$SUPABASE_ACCESS_TOKEN"
fi
if [ -z "${SUPABASE_MANAGEMENT_TOKEN:-}" ] && [ -f "$HOME/.supabase-token" ]; then
  SUPABASE_MANAGEMENT_TOKEN=$(cat "$HOME/.supabase-token" | tr -d '[:space:]')
fi

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

# 2b. Configure Supabase Auth (Site URL, redirect URLs, anon sign-in,
#     custom SMTP via Resend, raised rate limit). Idempotent — safe to
#     re-run when the same SUPABASE_REF is already configured.
#
#     Prevents two recurring class of bug:
#       (a) Magic-link redirects rejected because the deploy URL isn't
#           on the Supabase allow-list.
#       (b) The default Supabase SMTP capping at 2 sends/hour mid-build,
#           silently failing magic links once the cap is hit.
#
#     The block is best-effort: if RESEND_API_KEY isn't available or
#     no verified Resend domain exists, we still set Site URL + allow
#     list + anon (the SMTP swap is the only optional piece).
if [ -n "$SUPABASE_REF" ] && [ -n "${SUPABASE_MANAGEMENT_TOKEN:-}" ]; then
  echo ""
  echo "== Configuring Supabase Auth for '$SUPABASE_REF' =="

  # Resolve a Resend API key. Prefer env, then sibling .env.local files.
  RESEND_KEY="${RESEND_API_KEY:-}"
  if [ -z "$RESEND_KEY" ]; then
    for sibling in F2K-Checkpoint DealFindrs investorpilot PartnerPilot; do
      p="$HOME/PycharmProjects/$sibling/.env.local"
      [ -f "$p" ] || continue
      RESEND_KEY=$(grep '^RESEND_API_KEY=' "$p" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
      [ -n "$RESEND_KEY" ] && break
    done
  fi

  # Resolve a verified Resend domain. Try the Resend API first; fall back
  # to the canonical CAS-verified domain from global CLAUDE.md (the bare
  # corporateaisolutions.com is NOT verified — only the `updates.` subdomain).
  # Without this fallback the script silently stripped SMTP whenever the
  # Resend API call returned no data, exactly the recurring failure mode
  # the bootstrap-automation rule was meant to eliminate.
  RESEND_DOMAIN="${RESEND_VERIFIED_DOMAIN:-}"
  if [ -z "$RESEND_DOMAIN" ] && [ -n "$RESEND_KEY" ]; then
    RESEND_DOMAIN=$(curl -sS -H "Authorization: Bearer $RESEND_KEY" \
      "https://api.resend.com/domains" 2>/dev/null \
      | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for x in d.get('data') or []:
        if x.get('status') == 'verified':
            print(x['name']); break
except Exception:
    pass
" 2>/dev/null)
  fi
  if [ -z "$RESEND_DOMAIN" ] && [ -n "$RESEND_KEY" ]; then
    echo "  ⚠ Resend API returned no verified domain — falling back to canonical 'updates.corporateaisolutions.com'"
    echo "    (override with: export RESEND_VERIFIED_DOMAIN=<your-verified-domain>)"
    RESEND_DOMAIN="updates.corporateaisolutions.com"
  fi

  PROD_URL="https://${VERCEL_SLUG}-${TEAM_SLUG}.vercel.app"
  # Allow both /auth/callback (sign-in flows) and /auth/recover (password
  # recovery), each on localhost + prod + branch-preview-wildcard.
  ALLOW_LIST="http://localhost:3000${CALLBACK_PATH},http://localhost:3000${RECOVER_PATH},${PROD_URL}${CALLBACK_PATH},${PROD_URL}${RECOVER_PATH},https://*-${TEAM_SLUG}.vercel.app${CALLBACK_PATH},https://*-${TEAM_SLUG}.vercel.app${RECOVER_PATH}"
  SENDER_NAME=$(echo "$GH_REPO" | sed 's/-/ /g')

  if [ -n "$RESEND_KEY" ] && [ -n "$RESEND_DOMAIN" ]; then
    echo "  Resend domain detected ($RESEND_DOMAIN) — wiring custom SMTP"
    AUTH_PAYLOAD=$(SITE_URL="$PROD_URL" ALLOW_LIST="$ALLOW_LIST" \
      SMTP_PASS="$RESEND_KEY" ADMIN_EMAIL="noreply@$RESEND_DOMAIN" \
      SENDER_NAME="$SENDER_NAME" \
      python -c "
import os, json
print(json.dumps({
  'site_url': os.environ['SITE_URL'],
  'uri_allow_list': os.environ['ALLOW_LIST'],
  'external_anonymous_users_enabled': True,
  'smtp_host': 'smtp.resend.com',
  'smtp_port': '465',
  'smtp_user': 'resend',
  'smtp_pass': os.environ['SMTP_PASS'],
  'smtp_admin_email': os.environ['ADMIN_EMAIL'],
  'smtp_sender_name': os.environ['SENDER_NAME'],
  'rate_limit_email_sent': 30,
}))")
  else
    echo "  ⚠ No verified Resend domain — setting Site URL + allow list + anon only"
    echo "    (SMTP rate limit will stay at default 2/hr — magic-link testing will burn through it)"
    AUTH_PAYLOAD=$(SITE_URL="$PROD_URL" ALLOW_LIST="$ALLOW_LIST" \
      python -c "
import os, json
print(json.dumps({
  'site_url': os.environ['SITE_URL'],
  'uri_allow_list': os.environ['ALLOW_LIST'],
  'external_anonymous_users_enabled': True,
}))")
  fi

  auth_resp_file=$(mktemp 2>/dev/null || echo "/tmp/sb-auth-resp.$$")
  http=$(curl -sS -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_REF/config/auth" \
    -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$AUTH_PAYLOAD" \
    -o "$auth_resp_file" -w '%{http_code}')

  if [ "$http" = "200" ]; then
    echo "  ✓ site_url + uri_allow_list + anonymous sign-in"
    if [ -n "$RESEND_DOMAIN" ]; then
      echo "  ✓ SMTP via Resend; rate_limit_email_sent = 30/hr"
    fi
  else
    echo "  ✗ Auth config PATCH failed (HTTP $http)"
    head -c 400 "$auth_resp_file" | sed 's/^/    /'
    echo ""
  fi
  rm -f "$auth_resp_file"

  # 2c. Brand the five Supabase email templates (magic link, recovery,
  #     confirmation, invite, email change) with the project's display
  #     name. Default Supabase templates are bare-bones "Follow this
  #     link" copy — every project hits this. Display name derived from
  #     GH_REPO (CamelCase → spaced, dashes → spaces).
  DISPLAY_NAME=$(echo "$GH_REPO" | sed -e 's/-/ /g' -e 's/\([a-z]\)\([A-Z]\)/\1 \2/g')
  echo ""
  echo "== Branding Supabase email templates as '$DISPLAY_NAME' =="
  if [ -f "$HUB_ROOT/scripts/configure-email-templates.sh" ]; then
    SUPABASE_MANAGEMENT_TOKEN="$SUPABASE_MANAGEMENT_TOKEN" \
      bash "$HUB_ROOT/scripts/configure-email-templates.sh" \
      "$DISPLAY_NAME" "$SUPABASE_REF" 2>&1 | sed 's/^/  /'
  else
    echo "  ⚠ scripts/configure-email-templates.sh missing — skip"
  fi
elif [ -n "$SUPABASE_REF" ]; then
  echo ""
  echo "== Skipping Supabase Auth config + email templates — no SUPABASE_MANAGEMENT_TOKEN =="
  echo "  Set one of: SUPABASE_MANAGEMENT_TOKEN, SUPABASE_ACCESS_TOKEN, ~/.supabase-token"
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

# 4b. Provision the standard QA accounts (§9.5) into the product's Supabase + push the QA env
#     (QA_USER_EMAIL/PW, QA_OWNER_EMAIL/PW) and the ADMIN_EMAILS allowlist to Vercel — so the
#     dual-portal testers can log in with the one portfolio-wide credential set, zero manual Vercel
#     edits. Runs AFTER the manifest append (provision reads the new entry). Best-effort: degrades
#     with a clear re-run hint if a token/config is absent.
echo ""
echo "== Provisioning standard QA accounts + Vercel env ($VERCEL_SLUG) =="
if [ -f "$HUB_ROOT/scripts/provision-qa-accounts.mjs" ]; then
  node "$HUB_ROOT/scripts/provision-qa-accounts.mjs" --slug "$VERCEL_SLUG" --vercel 2>&1 | sed 's/^/  /' || \
    echo "  ⚠ QA provisioning incomplete — re-run: node scripts/provision-qa-accounts.mjs --slug $VERCEL_SLUG --vercel"
else
  echo "  ⚠ provision-qa-accounts.mjs missing — skip"
fi

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

  3. Set portfolio-wide secrets (OPENAI_API_KEY, ANTHROPIC_API_KEY,
     RESEND_API_KEY) on Vercel manually until Issue #10 lands.

  4. Run a full audit to confirm zero drift:
       export VERCEL_TOKEN=\$(cat ~/.vercel-token)
       node packages/portfolio-env-sync/dist/index.js --manifest portfolio-manifest.yaml

  5. Commit and push:
       git add portfolio-manifest.yaml scripts/
       git commit -m "feat(onboard): add $VERCEL_SLUG"
       git push
EOF
