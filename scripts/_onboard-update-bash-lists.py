#!/usr/bin/env python3
"""
Append a project to the hardcoded lists in scripts/*.sh.

Used by scripts/onboard-new-project.sh. Each handler is keyed to a
specific bash file's structure. All operations are idempotent — entries
already present are not duplicated.

Usage:
  python _onboard-update-bash-lists.py <hub-root> <gh-repo> <vercel-slug>

The handlers cover:
  - scripts/set-caistech-token.sh     (REPOS array + VERCEL_SLUG map)
  - scripts/set-vercel-env-v2.sh      (SLUGS string)
  - scripts/set-vercel-env-only.sh    (SLUGS array)
  - scripts/redeploy-vercel.sh        (SLUGS string)
"""

from __future__ import annotations

import os
import re
import sys

# Windows defaults to cp1252 for console stdout; force UTF-8 so the
# script's status symbols print correctly across platforms.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def insert_into_array(
    path: str,
    array_open_pattern: str,
    new_line: str,
    presence_pattern: str,
    label: str,
) -> None:
    """
    Insert `new_line` before the first `)` line that follows the line
    matching `array_open_pattern`. No-op if `presence_pattern` is already
    present anywhere in the file.
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    if any(re.search(presence_pattern, line) for line in lines):
        print(f"  · {label}: already has entry")
        return

    # Find the array's opening line, then its first standalone closing `)`
    in_array = False
    insert_idx: int | None = None
    for idx, line in enumerate(lines):
        if not in_array and re.search(array_open_pattern, line):
            in_array = True
            continue
        if in_array and re.match(r"^\s*\)\s*$", line):
            insert_idx = idx
            break

    if insert_idx is None:
        print(
            f"  ✗ {label}: could not find closing `)` after `{array_open_pattern}`",
            file=sys.stderr,
        )
        sys.exit(1)

    lines.insert(insert_idx, new_line + "\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"  ✓ {label}: appended")


def insert_into_string_var(
    path: str,
    var_pattern: str,
    new_token: str,
    label: str,
) -> None:
    """
    For lines of the form `VAR="a b c d"`, append `new_token` to the
    quoted list (idempotent). `var_pattern` should match the full
    assignment line.
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    found = False
    for idx, line in enumerate(lines):
        m = re.match(var_pattern, line)
        if m:
            found = True
            current = m.group(1)
            # Idempotency: already in list?
            tokens = current.split()
            if new_token in tokens:
                print(f"  · {label}: already has entry")
                return
            tokens.append(new_token)
            lines[idx] = line.replace(current, " ".join(tokens))
            break

    if not found:
        print(f"  ✗ {label}: could not find pattern `{var_pattern}`", file=sys.stderr)
        sys.exit(1)

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"  ✓ {label}: appended")


def insert_into_assoc_map(
    path: str,
    map_open_pattern: str,
    new_line: str,
    presence_pattern: str,
    label: str,
) -> None:
    """
    Same shape as insert_into_array but specifically for the SECOND
    array close in a file (Bash associative-array maps that come after
    a regular array).
    """
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    if any(re.search(presence_pattern, line) for line in lines):
        print(f"  · {label}: already has entry")
        return

    in_map = False
    insert_idx: int | None = None
    for idx, line in enumerate(lines):
        if not in_map and re.search(map_open_pattern, line):
            in_map = True
            continue
        if in_map and re.match(r"^\s*\)\s*$", line):
            insert_idx = idx
            break

    if insert_idx is None:
        print(
            f"  ✗ {label}: could not find closing `)` after `{map_open_pattern}`",
            file=sys.stderr,
        )
        sys.exit(1)

    lines.insert(insert_idx, new_line + "\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"  ✓ {label}: appended")


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "Usage: _onboard-update-bash-lists.py <hub-root> <gh-repo> <vercel-slug>",
            file=sys.stderr,
        )
        return 1

    hub_root, gh_repo, vercel_slug = sys.argv[1], sys.argv[2], sys.argv[3]
    s = os.path.join(hub_root, "scripts")

    # 1. set-caistech-token.sh — REPOS array (Bash regular array)
    insert_into_array(
        path=os.path.join(s, "set-caistech-token.sh"),
        array_open_pattern=r"^REPOS=\(",
        new_line=f"  {gh_repo}",
        presence_pattern=rf"^\s*{re.escape(gh_repo)}\s*$",
        label="set-caistech-token.sh REPOS",
    )

    # 2. set-caistech-token.sh — VERCEL_SLUG associative-array map
    insert_into_assoc_map(
        path=os.path.join(s, "set-caistech-token.sh"),
        map_open_pattern=r"^declare -A VERCEL_SLUG=\(",
        new_line=f"  [{gh_repo}]={vercel_slug}",
        presence_pattern=rf"\[{re.escape(gh_repo)}\]={re.escape(vercel_slug)}",
        label="set-caistech-token.sh VERCEL_SLUG",
    )

    # 3. set-vercel-env-v2.sh — SLUGS string
    insert_into_string_var(
        path=os.path.join(s, "set-vercel-env-v2.sh"),
        var_pattern=r'^SLUGS="([^"]*)"',
        new_token=vercel_slug,
        label="set-vercel-env-v2.sh SLUGS",
    )

    # 4. set-vercel-env-only.sh — SLUGS array
    insert_into_array(
        path=os.path.join(s, "set-vercel-env-only.sh"),
        array_open_pattern=r"^SLUGS=\(",
        new_line=f"  {vercel_slug}",
        presence_pattern=rf"^\s*{re.escape(vercel_slug)}\s*$",
        label="set-vercel-env-only.sh SLUGS",
    )

    # 5. (removed 2026-07-26) bump-consumers.sh — deleted along with this handler.
    #
    # It maintained a hardcoded ENTRIES list of consumer repos so a @caistech bump could be pushed
    # by hand from one machine. The list went stale faster than it was used: at deletion it still
    # carried archived repos (mmcbuild twice, gbta-openclaw, SmartBoard) and omitted more than half
    # the products actually consuming the substrate — so even running it did not do the job it
    # existed for.
    #
    # Superseded by per-repo .github/dependabot.yml, which discovers consumers from the dependency
    # graph rather than from a list a human has to remember to append to. Onboarding a new product
    # no longer needs to register it anywhere for substrate updates to reach it; scaffolding the
    # dependabot config (already in cais-build-template-v2) is what makes it a consumer.

    # 6. (removed 2026-07-26) finalize-consumers.sh — deleted along with this handler.
    #
    # The other half of the manual bump flow: regenerate each consumer's lockfile, commit, push.
    # Beyond carrying the same stale repo list as bump-consumers.sh, its COMMIT MESSAGE was
    # hardcoded to a single historical migration ("bump @caistech/* to compiled-dist versions",
    # naming seven specific old versions), so any later run would have committed that text no matter
    # what actually changed. It was a one-shot script that outlived its one shot.
    #
    # Dependabot opens PRs with the lockfile already regenerated and a message describing the real
    # change, which is the whole of what this did.

    # 7. redeploy-vercel.sh — SLUGS string
    insert_into_string_var(
        path=os.path.join(s, "redeploy-vercel.sh"),
        var_pattern=r'^SLUGS="([^"]*)"',
        new_token=vercel_slug,
        label="redeploy-vercel.sh SLUGS",
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
