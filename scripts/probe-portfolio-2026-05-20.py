#!/usr/bin/env python3
"""
Portfolio naive-tester re-sweep — cheap probe (2026-05-20).

Reads probe-roster-2026-05-20.json and emits a CSV + markdown matrix.

Per product:
  1. Canonical URL status code + page title
  2. Each key-route status code
  3. Title vs expected product name (scaffold-default detection)

Usage:  python scripts/probe-portfolio-2026-05-20.py
Output:
  probe-results-2026-05-20.csv     raw per-route results
  probe-summary-2026-05-20.md      markdown traffic-light table
"""

import csv
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parent.parent
ROSTER_PATH = ROOT / "probe-roster-2026-05-20.json"
CSV_PATH = ROOT / "probe-results-2026-05-20.csv"
MD_PATH = ROOT / "probe-summary-2026-05-20.md"

UA = "Mozilla/5.0 (compatible; CAIS-Portfolio-Probe/2026-05-20)"
TIMEOUT = 15
TITLE_RE = re.compile(r"<title[^>]*>([^<]*)</title>", re.IGNORECASE)
SCAFFOLD_RE = re.compile(r"^(create next app|next\.?js|page not found|404)", re.IGNORECASE)


def fetch(url: str, head: bool = False) -> tuple[int, str]:
    """Return (status_code, body). status=0 on network error."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
        method="HEAD" if head else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if head:
                return resp.status, ""
            raw = resp.read(200_000)
            try:
                return resp.status, raw.decode("utf-8", errors="replace")
            except Exception:
                return resp.status, ""
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def extract_title(html: str) -> str:
    m = TITLE_RE.search(html)
    if not m:
        return ""
    return re.sub(r"\s+", " ", m.group(1)).strip()


def probe_product(prod: dict) -> dict:
    slug = prod["slug"]
    url = prod["canonical_url"]
    expected = prod["expected_title_contains"].lower()
    routes = prod["key_routes"]

    root_status, html = fetch(url, head=False)
    title = extract_title(html)

    if not title:
        title_verdict = "no"
        title_note = "empty title" if root_status in (200, 0) else f"no body (http {root_status})"
    elif SCAFFOLD_RE.search(title):
        title_verdict = "no"
        title_note = f"scaffold-default ({title!r})"
    elif expected not in title.lower():
        title_verdict = "partial"
        title_note = f"title={title!r} (expected to contain {prod['expected_title_contains']!r})"
    else:
        title_verdict = "yes"
        title_note = ""

    route_results = []
    for route in routes:
        if route == "/":
            continue
        target = urljoin(url + "/", route.lstrip("/"))
        rstatus, _ = fetch(target, head=True)
        # Some hosts reject HEAD; fall back to GET
        if rstatus in (0, 405, 501):
            rstatus, _ = fetch(target, head=False)
        ok = 200 <= rstatus < 400
        route_results.append({"route": route, "status": rstatus, "ok": ok})

    routes_ok = sum(1 for r in route_results if r["ok"])
    routes_total = len(route_results)
    broken = [f"{r['route']}={r['status']}" for r in route_results if not r["ok"]]

    # Traffic light
    light = "GREEN"
    byok = "yes"
    notes = []

    if root_status < 200 or root_status >= 400:
        light = "RED"
        byok = "no"
        notes.append(f"root {root_status}")
    if title_verdict == "no":
        light = "RED"
        byok = "no"
        notes.append(title_note)
    elif title_verdict == "partial":
        if light == "GREEN":
            light = "AMBER"
        byok = "no"
        notes.append(title_note)
    if routes_total > 0 and routes_ok < routes_total:
        if light == "GREEN":
            light = "AMBER"
        byok = "no"
        notes.append("broken: " + " ".join(broken))

    return {
        "slug": slug,
        "display": prod["display_name"],
        "url": url,
        "status_was": prod["status_2026_05_19"],
        "root_status": root_status,
        "title": title,
        "title_verdict": title_verdict,
        "title_note": title_note,
        "routes_ok": routes_ok,
        "routes_total": routes_total,
        "route_results": route_results,
        "broken_routes": broken,
        "light": light,
        "byok": byok,
        "notes": "; ".join(notes),
        "critical_issue": prod["critical_issue"],
    }


def main():
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    print(f"Probing {len(roster)} products...", file=sys.stderr)

    results = []
    # Probe in parallel — 8 at a time
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(probe_product, p): p for p in roster}
        for f in as_completed(futures):
            try:
                r = f.result()
                results.append(r)
                print(f"  [{r['light']:>5}] {r['slug']:<32} root={r['root_status']} routes={r['routes_ok']}/{r['routes_total']}", file=sys.stderr)
            except Exception as e:
                p = futures[f]
                print(f"  [ERROR] {p['slug']}: {e}", file=sys.stderr)

    # Sort by slug for stable output
    results.sort(key=lambda r: r["slug"])

    # CSV
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["slug", "route", "status", "title", "title_verdict", "note"])
        for r in results:
            w.writerow([r["slug"], "/", r["root_status"], r["title"], r["title_verdict"], r["title_note"]])
            for rr in r["route_results"]:
                w.writerow([r["slug"], rr["route"], rr["status"], "", "", "ok" if rr["ok"] else "failed"])

    # Markdown
    tally = {"GREEN": 0, "AMBER": 0, "RED": 0}
    for r in results:
        tally[r["light"]] += 1

    light_emoji = {"GREEN": "🟢", "AMBER": "🟡", "RED": "🔴"}

    with MD_PATH.open("w", encoding="utf-8") as f:
        f.write("# Portfolio Naive-Tester Re-Sweep — 2026-05-20 (cheap-probe pass)\n\n")
        f.write("> Auto-generated by `scripts/probe-portfolio-2026-05-20.py`. Re-runnable.\n")
        f.write("> Cheap probe — HTTP status + title + key-route reachability.\n")
        f.write("> Per-repo persona findings: `<repo>/docs/NAIVE_TESTER_REMEDIATION_2026-05-19.md`.\n\n")

        f.write("## Tally\n\n")
        f.write(f"- 🟢 Green (basic URL plumbing OK): **{tally['GREEN']}**\n")
        f.write(f"- 🟡 Amber (root reachable, but issues): **{tally['AMBER']}**\n")
        f.write(f"- 🔴 Red (root broken or scaffold-default): **{tally['RED']}**\n\n")

        f.write("## Traffic-light per product\n\n")
        f.write("| | Slug | Was (2026-05-19) | Root | Title | Routes OK | BYOK ready? | Notes |\n")
        f.write("|---|---|---|---|---|---|---|---|\n")
        for r in results:
            f.write(
                f"| {light_emoji[r['light']]} | `{r['slug']}` | {r['status_was']} | {r['root_status']} | "
                f"{r['title_verdict']} | {r['routes_ok']}/{r['routes_total']} | "
                f"**{r['byok']}** | {r['notes']} |\n"
            )

        f.write("\n## Greens — basic plumbing OK\n\n")
        greens = [r for r in results if r["light"] == "GREEN"]
        if not greens:
            f.write("_(none)_\n")
        else:
            for r in greens:
                f.write(f"- **{r['display']}** (`{r['slug']}`) — {r['url']}\n")
                f.write(f"  - Was 2026-05-19: {r['status_was']}\n")
                f.write(f"  - Persona issue still standing: {r['critical_issue']}\n")
                f.write("  - Plumbing OK now doesn't mean the persona issue is closed — verify against the per-repo doc.\n")

        f.write("\n## Reds — held from BYOK rewrite\n\n")
        reds = [r for r in results if r["light"] == "RED"]
        if not reds:
            f.write("_(none)_\n")
        else:
            for r in reds:
                f.write(f"- **{r['display']}** (`{r['slug']}`) — {r['url']}\n")
                f.write(f"  - Root status: {r['root_status']}; title: {r['title']!r} ({r['title_verdict']})\n")
                if r["broken_routes"]:
                    f.write(f"  - Broken routes: {', '.join(r['broken_routes'])}\n")
                f.write(f"  - 2026-05-19 persona issue: {r['critical_issue']}\n")

        f.write("\n## Method + caveats\n\n")
        f.write("- HTTP probe via Python urllib, 15s timeout, UA `" + UA + "`.\n")
        f.write("- Title check: pass = contains expected product name; partial = non-empty but doesn't match; fail = empty or scaffold-default (`Create Next App`, `Next.js`, etc.).\n")
        f.write("- Routes check: 2xx/3xx counted as OK. HEAD with GET fallback.\n")
        f.write("- **This probe cannot detect persona-level issues** (broken CTAs returning 200, data leaks behind auth, copy failures, RLS holes on 200 endpoints).\n")
        f.write("- BYOK = 'BYOK-ready candidate'. GREEN means basic plumbing is sound; it does NOT mean 2026-05-19 persona findings are resolved.\n")

    print(f"\nDone.", file=sys.stderr)
    print(f"  CSV: {CSV_PATH}", file=sys.stderr)
    print(f"  MD:  {MD_PATH}", file=sys.stderr)
    print(f"  Tally: GREEN={tally['GREEN']} AMBER={tally['AMBER']} RED={tally['RED']}", file=sys.stderr)


if __name__ == "__main__":
    main()
