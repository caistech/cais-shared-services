#!/usr/bin/env python3
"""
Patch ssoProtection.deploymentType on a Vercel project (Corporate AI Solutions team).

Mirrors the 2026-05-20 fix applied to connexions / ndissda-automate / partner-pilot /
gbta-openclaw: switch from "all_except_custom_domains" (production canonical URLs 401)
to "preview" (production public, preview deploys protected).

Usage:
  python scripts/patch-ssoprotection.py <project-name> [--dry-run]

Env:
  VERCEL_TOKEN  — Bearer token with SAML-authenticated access to the team scope.
                  Falls back to reading ~/.vercel-token.

Example:
  python scripts/patch-ssoprotection.py r-and-d-tax-eligibility-work-recording

If the token returns 403 'saml: true', refresh via:
  https://vercel.com/account/tokens   (create a new token; complete SAML in the same browser session)
  then  export VERCEL_TOKEN=<new-token>
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

TEAM_ID = "team_hwN7IFtd2Fo3DCj9C67ZwI1t"  # Corporate AI Solutions
DESIRED = {"deploymentType": "preview"}


def get_token() -> str:
    if t := os.environ.get("VERCEL_TOKEN"):
        return t.strip()
    p = Path.home() / ".vercel-token"
    if p.exists():
        return p.read_text().strip()
    print("ERROR: No VERCEL_TOKEN env var and no ~/.vercel-token file.", file=sys.stderr)
    sys.exit(1)


def api(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    url = f"https://api.vercel.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": {"message": body}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("project_name")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = get_token()

    # Resolve project name → id
    status, body = api("GET", f"/v9/projects/{args.project_name}?teamId={TEAM_ID}", token)
    if status == 403 and (body.get("error", {}).get("saml") or "saml" in body.get("error", {}).get("message", "").lower()):
        print("\nERROR: 403 SAML — token does not have an active SAML session for the corporate-ai-solutions scope.")
        print("Fix:")
        print("  1. Open https://vercel.com/account/tokens in a browser logged into the CAS team.")
        print("  2. Generate a fresh token (the browser session will satisfy SAML).")
        print("  3. export VERCEL_TOKEN=<new-token>   (or write to ~/.vercel-token)")
        print("  4. Re-run this script.\n")
        sys.exit(2)
    if status != 200:
        print(f"ERROR fetching project: {status} {body}", file=sys.stderr)
        sys.exit(1)

    name = body.get("name")
    pid = body.get("id")
    current = body.get("ssoProtection")
    print(f"Project:  {name}  ({pid})")
    print(f"Current ssoProtection: {json.dumps(current)}")

    if current == DESIRED:
        print(f"Already at desired state ({DESIRED}). No patch needed.")
        return

    if args.dry_run:
        print(f"DRY-RUN: would PATCH to {DESIRED}")
        return

    print(f"Patching ssoProtection -> {DESIRED} ...")
    status, body = api(
        "PATCH",
        f"/v9/projects/{pid}?teamId={TEAM_ID}",
        token,
        {"ssoProtection": DESIRED},
    )
    if status not in (200, 204):
        print(f"ERROR patching: {status} {body}", file=sys.stderr)
        sys.exit(1)

    new = body.get("ssoProtection")
    print(f"Patched. New ssoProtection: {json.dumps(new)}")

    # Verify production URL is now public
    target = body.get("targets", {}).get("production")
    prod_url = None
    if target and target.get("url"):
        prod_url = "https://" + target["url"]
    elif body.get("latestDeployments"):
        prod_url = "https://" + body["latestDeployments"][0]["url"]

    if prod_url:
        print(f"\nProbing {prod_url} to confirm public access ...")
        import urllib.request as ur
        try:
            r = ur.urlopen(ur.Request(prod_url, method="HEAD"), timeout=15)
            print(f"  {prod_url} -> HTTP {r.status}")
        except urllib.error.HTTPError as e:
            print(f"  {prod_url} -> HTTP {e.code}")
        except Exception as e:
            print(f"  {prod_url} -> error: {e}")


if __name__ == "__main__":
    main()
