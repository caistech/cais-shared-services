#!/usr/bin/env python3
"""
Portable auth-flow tester — the SESSION-LANDING check.

Why this exists
---------------
The portfolio's auth bugs (executorai: ConfirmationURL template; the cockpit:
no post-auth navigation) all share one property: the user AUTHENTICATES
SUCCESSFULLY but never lands in the app. signInWithOtp / signInWithPassword
return no error, the email sends, the token verifies — and yet you're left on
the login form or the marketing page. So a tester that asserts "no error" or
"email sent" PASSES every one of these broken apps. This tester instead asserts
the only thing that matters to a human:

    after verifying a real link, (1) a Supabase session cookie is actually set
    AND (2) the response redirects to an AUTHENTICATED route, not /login.

It is the detection layer; making auth a consumed @caistech/next-auth package is
the prevention layer. Run this against every public-facing deploy as a release
gate.

What it does (no browser, no email, no npm deps — CI-friendly)
1. Reads the Supabase Management token (~/.supabase-token) and reveals the
   project's service_role + anon keys via the Management API.
2. Ensures a confirmed QA user exists (admin API; idempotent).
3. Mints a REAL magic-link token via the admin generate_link endpoint.
4. GETs the deployed /auth/callback?...&token_hash=...&type=... WITHOUT following
   redirects, and inspects the Set-Cookie + Location headers.
5. PASS only if a session cookie is set AND the redirect target is an authed
   route (configurable; default: not /login and not the marketing page).

Usage:
    python auth-flow-test.py --base https://<app>.vercel.app \
        --ref <supabase-project-ref> [--callback /auth/callback] \
        [--landing /estate] [--type email] [--qa-email dennis@factory2key.com.au]

Exit code 0 = PASS, 1 = FAIL — so it drops straight into CI.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

UA = "curl/8.4.0"  # the Management API's Cloudflare blocks Python-urllib (err 1010)


def mgmt_token():
    for env in ("SUPABASE_MANAGEMENT_TOKEN", "SUPABASE_ACCESS_TOKEN"):
        if os.environ.get(env):
            return os.environ[env].strip()
    with open(os.path.expanduser("~/.supabase-token")) as f:
        return f.read().strip()


def http(url, method="GET", headers=None, body=None, allow_redirects=True):
    """Returns (status, headers_list, body_text). Never raises on 4xx/5xx/3xx."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", UA)
    for k, v in (headers or {}).items():
        req.add_header(k, v)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener() if allow_redirects \
        else urllib.request.build_opener(NoRedirect)
    try:
        r = opener.open(req)
        return r.status, r.getheaders(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, list(e.headers.items()), e.read().decode("utf-8", "replace")


def reveal_keys(ref, token):
    url = f"https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true"
    status, _, text = http(url, headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        sys.exit(f"FATAL: could not read api keys (HTTP {status}): {text[:300]}")
    keys = json.loads(text)
    out = {}
    for k in keys:
        if k.get("name") in ("anon", "service_role") and k.get("api_key"):
            out[k["name"]] = k["api_key"]
    if "service_role" not in out:
        sys.exit("FATAL: service_role key not revealed")
    return out


def supabase_base(ref):
    return f"https://{ref}.supabase.co"


def ensure_qa_user(ref, service_role, email, password):
    """Idempotent: create a confirmed user; ignore 'already exists'."""
    url = f"{supabase_base(ref)}/auth/v1/admin/users"
    h = {"apikey": service_role, "Authorization": f"Bearer {service_role}",
         "Content-Type": "application/json"}
    status, _, text = http(url, "POST", h,
                           {"email": email, "password": password,
                            "email_confirm": True})
    if status in (200, 201):
        return "created"
    if status in (409, 422) or "already" in text.lower() or "registered" in text.lower():
        return "exists"
    sys.exit(f"FATAL: could not ensure QA user (HTTP {status}): {text[:300]}")


def mint_magic_token(ref, service_role, email, link_type="magiclink"):
    url = f"{supabase_base(ref)}/auth/v1/admin/generate_link"
    h = {"apikey": service_role, "Authorization": f"Bearer {service_role}",
         "Content-Type": "application/json"}
    status, _, text = http(url, "POST", h, {"type": link_type, "email": email})
    if status not in (200, 201):
        sys.exit(f"FATAL: generate_link failed (HTTP {status}): {text[:300]}")
    d = json.loads(text)
    # GoTrue returns the hashed_token at top level or under .properties
    token = d.get("hashed_token") or (d.get("properties") or {}).get("hashed_token")
    if not token:
        sys.exit(f"FATAL: no hashed_token in generate_link response: {text[:300]}")
    return token


def run(args):
    token = mgmt_token()
    keys = reveal_keys(args.ref, token)
    print(f"  · service_role key revealed for {args.ref}")

    state = ensure_qa_user(args.ref, keys["service_role"], args.qa_email, args.qa_password)
    print(f"  · QA user {args.qa_email}: {state}")

    hashed = mint_magic_token(args.ref, keys["service_role"], args.qa_email)
    print(f"  · minted magic-link token ({hashed[:10]}…)")

    cb = (f"{args.base.rstrip('/')}{args.callback}"
          f"?next={args.landing}&token_hash={hashed}&type={args.type}")
    print(f"  · GET {args.callback}?next={args.landing}&token_hash=…&type={args.type}")
    status, headers, _ = http(cb, allow_redirects=False)

    set_cookies = [v for (k, v) in headers if k.lower() == "set-cookie"]
    location = next((v for (k, v) in headers if k.lower() == "location"), "")
    session_cookie = any("auth-token" in c and c.split("=")[0].startswith("sb-")
                         for c in set_cookies)
    # landed somewhere authed: a redirect that is NOT back to a login/marketing route
    bad_targets = [args.callback, "/login", "/admin/login", "/welcome", "error=auth"]
    redirected_to_app = (300 <= status < 400) and location and \
        not any(b in location for b in bad_targets)

    print()
    print(f"  status:          {status}")
    print(f"  Location:        {location or '(none)'}")
    print(f"  session cookie:  {'YES' if session_cookie else 'NO'} "
          f"({len(set_cookies)} Set-Cookie header(s))")
    print()

    checks = {
        "Session cookie is set (sb-*-auth-token)": session_cookie,
        f"Redirects to an authed route (saw '{location}')": redirected_to_app,
    }
    ok = all(checks.values())
    for name, passed in checks.items():
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
    print()
    print("RESULT:", "PASS — auth lands a session ✅" if ok
          else "FAIL — authenticated but did NOT land in the app ❌")
    return 0 if ok else 1


def main():
    p = argparse.ArgumentParser(description="Session-landing auth-flow tester")
    p.add_argument("--base", required=True, help="deployed app base URL")
    p.add_argument("--ref", required=True, help="Supabase project ref")
    p.add_argument("--callback", default="/auth/callback")
    p.add_argument("--landing", default="/estate", help="expected authed route after login")
    p.add_argument("--type", default="email", help="verifyOtp type the template uses")
    p.add_argument("--qa-email", default="dennis@factory2key.com.au")
    p.add_argument("--qa-password", default=os.environ.get("QA_USER_PASSWORD", "QaTest!9182pw"))
    args = p.parse_args()
    print(f"AUTH-FLOW TEST — {args.base}")
    sys.exit(run(args))


if __name__ == "__main__":
    main()
