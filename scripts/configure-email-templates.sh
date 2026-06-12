#!/usr/bin/env bash
# scripts/configure-email-templates.sh
#
# Set the five Supabase Auth email templates (magic link, recovery,
# confirm signup, invite, email change) on a project, branded with the
# project's display name. Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/configure-email-templates.sh "<Display Name>" <supabase-ref> [--dry-run]
#
# Example:
#   bash scripts/configure-email-templates.sh "MMC Build" skyeqimwnyuuozvhubdc
#   bash scripts/configure-email-templates.sh "InvestorPilot" abcdefghijklmnopqrst --dry-run
#
# Tokens read in priority order:
#   1. $SUPABASE_MANAGEMENT_TOKEN
#   2. $SUPABASE_ACCESS_TOKEN
#   3. ~/.supabase-token
#
# Why this exists:
#   The default Supabase email templates are unbranded and use a plain
#   "Follow this link" message that confuses end users. Setting them
#   per-project by hand is exactly the kind of recurring setup tax the
#   bootstrap-automation rule in global CLAUDE.md was meant to eliminate.
#
# CANONICAL AUTH-EMAIL RULES (learned from the executorai 2026-06-12 incident):
#   1. site_url MUST be the PUBLIC production domain — never an SSO-protected
#      team-slug alias (e.g. <slug>-corporate-ai-solutions.vercel.app). These
#      templates use {{ .ConfirmationURL }}, which Supabase builds off site_url;
#      a protected/wrong site_url sends every auth email to a 401 wall. This
#      script PRE-FLIGHT CHECKS site_url and warns if it looks SSO-walled.
#   2. {{ .ConfirmationURL }} is correct under the PKCE flow (@supabase/ssr): it
#      yields a ?code= link the product's callback exchanges. The canonical
#      /auth/callback handles BOTH ?code= (exchangeCodeForSession) AND
#      ?token_hash=&type= (verifyOtp), so either email shape works.
#   3. NEVER hand-roll `{{ .RedirectTo }}&token_hash={{ .TokenHash }}`. When the
#      client's emailRedirectTo isn't allow-listed, RedirectTo falls back to the
#      bare site_url and the link becomes `<domain>&token_hash=...` (malformed,
#      no /auth/callback path). That was the executorai bug — use ConfirmationURL
#      (here) or the self-contained {{ .SiteURL }}/auth/callback?token_hash=... form.

set -euo pipefail

PROJECT_NAME="${1:-}"
SUPABASE_REF="${2:-}"
DRY_RUN="${3:-}"

if [ -z "$PROJECT_NAME" ] || [ -z "$SUPABASE_REF" ]; then
  cat <<EOF >&2
Usage: $0 "<Display Name>" <supabase-ref> [--dry-run]

  Display Name    Project name as shown in email headers (e.g. "MMC Build")
  supabase-ref    20-char Supabase project ref
  --dry-run       Print the JSON payload without sending

Example:
  $0 "MMC Build" skyeqimwnyuuozvhubdc
EOF
  exit 1
fi

# Resolve Supabase Management API token
TOKEN="${SUPABASE_MANAGEMENT_TOKEN:-${SUPABASE_ACCESS_TOKEN:-}}"
if [ -z "$TOKEN" ] && [ -f "$HOME/.supabase-token" ]; then
  TOKEN=$(cat "$HOME/.supabase-token" | tr -d '[:space:]')
fi
if [ -z "$TOKEN" ]; then
  echo "ERROR: no Supabase token found (set SUPABASE_MANAGEMENT_TOKEN or ~/.supabase-token)" >&2
  exit 1
fi

# --- Pre-flight: site_url sanity (the executorai 401-wall failure mode) -----
# {{ .ConfirmationURL }} is built off the project's site_url. If site_url is empty
# or points at an SSO-protected team-slug alias, every auth email lands on a 401
# wall. Read it and WARN loudly before patching (non-blocking — the operator may
# be about to fix it, but must not configure templates blind to a broken site_url).
SITE_URL=$(curl -sS "https://api.supabase.com/v1/projects/$SUPABASE_REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys,json; print((json.load(sys.stdin).get('site_url') or '').strip())" 2>/dev/null || echo "")
if [ -z "$SITE_URL" ]; then
  echo "  ⚠ site_url is EMPTY on $SUPABASE_REF — ConfirmationURL links will be malformed." >&2
  echo "    Set it to the PUBLIC production domain first (Management API or @caistech/portfolio-env-sync auth_config)." >&2
elif echo "$SITE_URL" | grep -qE '\-(corporate-ai-solutions|mmc-build)\.vercel\.app'; then
  echo "  ⚠ site_url is a TEAM-SLUG alias ($SITE_URL) — these are commonly SSO-protected (401 wall)." >&2
  echo "    Auth emails build off site_url; point it at the PUBLIC production domain (the <slug>-<hash>.vercel.app" >&2
  echo "    public alias or a real custom domain) before relying on these templates. See the executorai 2026-06-12 incident." >&2
else
  echo "  site_url: $SITE_URL (looks public — ok)"
fi

# Build payload via Python so HTML escaping is sane
PAYLOAD=$(PROJECT_NAME="$PROJECT_NAME" python <<'PY'
import os, json

NAME = os.environ["PROJECT_NAME"]

def shell(subline, headline, intro, cta, footer):
    return f"""<!DOCTYPE html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#fafafa; margin:0; padding:32px 16px; color:#18181b;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;border:1px solid #e5e5e5;">
      <tr>
        <td style="padding:32px 32px 24px;">
          <div style="font-size:20px;font-weight:600;line-height:1;margin:0 0 4px;color:#18181b;">{NAME}</div>
          <div style="font-size:11px;color:#a3a3a3;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 28px;">{subline}</div>
          <h1 style="font-size:22px;font-weight:600;margin:0 0 12px;color:#18181b;line-height:1.3;">{headline}</h1>
          <p style="font-size:15px;line-height:1.6;color:#404040;margin:0 0 24px;">{intro}</p>
          <p style="margin:0 0 28px;">
            <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">{cta}</a>
          </p>
          <p style="font-size:13px;color:#737373;line-height:1.5;margin:0 0 24px;">Or paste this link into your browser:<br><span style="word-break:break-all;color:#525252;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">{{{{ .ConfirmationURL }}}}</span></p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 20px;">
          <p style="font-size:12px;color:#a3a3a3;line-height:1.5;margin:0;">{footer}</p>
        </td>
      </tr>
    </table>
  </body>
</html>"""

magic_link = shell(
    subline="Sign-in link",
    headline="Welcome back",
    intro=f"Click the button below to sign in to {NAME}. This link is valid for 1 hour and can only be used once.",
    cta="Sign in",
    footer="If you didn't request this sign-in link, you can safely ignore this email.",
)

recovery = shell(
    subline="Password reset",
    headline="Set a new password",
    intro=f"Click the button below to choose a new password for your {NAME} account. The link is valid for 1 hour.",
    cta="Reset password",
    footer="If you didn't request a password reset, you can safely ignore this email — your existing password will remain unchanged.",
)

confirmation = shell(
    subline="Confirm your email",
    headline=f"Welcome to {NAME}",
    intro="Thanks for signing up. Click the button below to confirm your email and finish creating your account.",
    cta="Confirm email",
    footer=f"If you didn't sign up for {NAME}, you can safely ignore this email.",
)

invite = shell(
    subline="Team invitation",
    headline="You've been invited",
    intro=f"You've been invited to join {NAME}. Click the button below to accept and set up your account.",
    cta="Accept invitation",
    footer="If you weren't expecting this invitation, you can safely ignore this email.",
)

email_change = shell(
    subline="Confirm new email",
    headline="Confirm your new email address",
    intro=f"Click the button below to confirm this is your new email address for {NAME}.",
    cta="Confirm new email",
    footer="If you didn't request to change your email, please reset your password to secure your account.",
)

payload = {
    "mailer_subjects_magic_link": f"Sign in to {NAME}",
    "mailer_subjects_recovery": f"Reset your {NAME} password",
    "mailer_subjects_confirmation": f"Confirm your {NAME} account",
    "mailer_subjects_invite": f"You've been invited to {NAME}",
    "mailer_subjects_email_change": f"Confirm your new {NAME} email",

    "mailer_templates_magic_link_content": magic_link,
    "mailer_templates_recovery_content": recovery,
    "mailer_templates_confirmation_content": confirmation,
    "mailer_templates_invite_content": invite,
    "mailer_templates_email_change_content": email_change,
}

print(json.dumps(payload))
PY
)

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "$PAYLOAD" | python -m json.tool
  echo ""
  echo "(dry-run — no PATCH sent)"
  exit 0
fi

echo "== Patching email templates for '$PROJECT_NAME' on $SUPABASE_REF =="

http=$(curl -sS -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -o /tmp/sb-templates.resp -w '%{http_code}')

if [ "$http" = "200" ]; then
  echo "  ✓ All 5 email templates configured (magic link, recovery, confirmation, invite, email change)"
  echo "  ✓ All 5 subject lines branded with '$PROJECT_NAME'"
else
  echo "  ✗ PATCH failed (HTTP $http)"
  head -c 600 /tmp/sb-templates.resp | sed 's/^/    /'
  echo ""
  rm -f /tmp/sb-templates.resp
  exit 1
fi
rm -f /tmp/sb-templates.resp
