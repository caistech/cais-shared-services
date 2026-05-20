#!/usr/bin/env python3
"""
Append a 2026-05-20 re-test addendum to each NAIVE_TESTER_REMEDIATION_2026-05-19.md.

Reads probe-roster-2026-05-20.json + probe-results-2026-05-20.csv and writes a
short status block at the bottom of each repo's remediation doc. Idempotent —
if the addendum already exists it is replaced.

Usage:  python scripts/append-resweep-addenda.py [--dry-run]
"""

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER_PATH = ROOT / "probe-roster-2026-05-20.json"
CSV_PATH = ROOT / "probe-results-2026-05-20.csv"

ADDENDUM_HEADER = "## 2026-05-20 Re-sweep addendum (cheap-probe)"
ADDENDUM_FOOTER = "<!-- /resweep-2026-05-20 -->"


def load_probe_data():
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    by_slug = {p["slug"]: p for p in roster}

    routes_by_slug = defaultdict(list)
    with CSV_PATH.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            routes_by_slug[row["slug"]].append(row)
    return by_slug, routes_by_slug


def build_addendum(prod, route_rows):
    root = next((r for r in route_rows if r["route"] == "/"), None)
    others = [r for r in route_rows if r["route"] != "/"]

    root_status = root["status"] if root else "?"
    title = root["title"] if root else ""
    title_verdict = root["title_verdict"] if root else ""
    title_note = root["note"] if root else ""

    routes_ok = sum(1 for r in others if r["note"] == "ok")
    routes_total = len(others)
    broken = [f"`{r['route']}` ({r['status']})" for r in others if r["note"] != "ok"]

    if root_status not in ("200", "301", "302", "307", "308") or title_verdict == "no":
        light = "🔴 RED"
        byok = "**NO — held from BYOK rewrite**"
    elif title_verdict == "partial" or (routes_total > 0 and routes_ok < routes_total):
        light = "🟡 AMBER"
        byok = "**NO — persona findings + plumbing gaps still standing**"
    else:
        light = "🟢 GREEN"
        byok = "**Basic plumbing OK** — BYOK candidate (subject to persona-issue check above)"

    lines = [
        f"\n---\n",
        f"{ADDENDUM_HEADER}\n",
        f"**Date:** 2026-05-20  ",
        f"**Method:** automated HTTP probe (curl-equivalent) of root + 3 key routes (see `cais-shared-services/probe-roster-2026-05-20.json`)  ",
        f"**Full portfolio brief:** `cais-shared-services/PORTFOLIO_NAIVE_RESWEEP_2026-05-20.md`",
        "",
        f"**Re-test result:** {light}",
        "",
        f"- Root: HTTP `{root_status}`",
        f"- Title: `{title}` ({title_verdict})" + (f" — {title_note}" if title_note else ""),
        f"- Key routes resolving: **{routes_ok}/{routes_total}**",
    ]
    if broken:
        lines.append(f"- Broken: {', '.join(broken)}")
    lines.append("")
    lines.append(f"**BYOK-ready determination:** {byok}")
    lines.append("")
    lines.append("**What this re-test can and cannot say:**")
    lines.append("")
    lines.append("- ✅ It confirms the URL plumbing reachable from a 2026-05-20 curl.")
    lines.append("- ❌ It cannot verify the persona-level findings in this doc — copy quality, trust signals, CTAs that return 200 but go nowhere, RLS holes behind 200 auth pages.")
    lines.append("- The persona findings above remain authoritative until each is individually re-tested.")
    lines.append("")
    lines.append(ADDENDUM_FOOTER)
    lines.append("")
    return "\n".join(lines)


def upsert_addendum(doc_path: Path, addendum: str, dry_run: bool) -> str:
    if not doc_path.exists():
        return f"MISSING: {doc_path}"

    text = doc_path.read_text(encoding="utf-8")
    marker = ADDENDUM_FOOTER

    if marker in text:
        # Replace existing addendum (everything from the most recent ADDENDUM_HEADER to marker)
        header_idx = text.rfind(ADDENDUM_HEADER)
        marker_idx = text.find(marker, header_idx) + len(marker)
        # Find start of the `---` separator before the header
        sep_idx = text.rfind("\n---\n", 0, header_idx)
        if sep_idx == -1:
            sep_idx = header_idx
        new_text = text[:sep_idx].rstrip() + addendum
        action = "replaced"
    else:
        new_text = text.rstrip() + "\n" + addendum
        action = "appended"

    if dry_run:
        return f"{action} (dry-run): {doc_path}"
    doc_path.write_text(new_text, encoding="utf-8")
    return f"{action}: {doc_path}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    by_slug, routes_by_slug = load_probe_data()

    for slug, prod in sorted(by_slug.items()):
        doc_path = Path(prod["remediation_doc_path"])
        addendum = build_addendum(prod, routes_by_slug.get(slug, []))
        msg = upsert_addendum(doc_path, addendum, args.dry_run)
        print(msg)


if __name__ == "__main__":
    main()
