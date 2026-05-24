#!/usr/bin/env bash
# scripts/customize-metadata.sh
#
# Customise a project's root metadata block (title / description / openGraph /
# twitter / icons) from its portfolio-manifest.yaml `product_registry` entry.
# Implements the SCAFFOLD-TIME METADATA CUSTOMIZATION rule (global CLAUDE.md /
# PRODUCT_STANDARDS §7) as the standalone retrofit path: when a portfolio sweep
# flags a product as `metadata_status: scaffold-default`, run one command
# instead of hand-editing layout.tsx.
#
# Usage:
#   bash scripts/customize-metadata.sh <slug> [repo-dir] [--apply]
#
#   slug       product_registry key (== the project `name:` in the manifest)
#   repo-dir   path to the consumer repo (default: $HOME/PycharmProjects/<slug>)
#   --apply    write the change (default is a dry run that prints the diff)
#
# Examples:
#   bash scripts/customize-metadata.sh hair-stylist-ai                       # dry run, default dir
#   bash scripts/customize-metadata.sh hair-stylist-ai ~/PycharmProjects/HairStylistAI --apply
#
# DOES: read the manifest, detect App Router (src/app/layout.tsx) vs Pages
#       Router (_document), write/replace the metadata block, idempotently,
#       refusing to overwrite a hand-edited (non-scaffold) title.
# DOES NOT: commit, push, or invent copy — tagline/description/canonical_url/
#       og_image must be filled in the manifest first (the worker errors if a
#       required field is missing).

set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ] || [ "$SLUG" = "--apply" ]; then
  sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi
shift

# Parse optional [repo-dir] and --apply in any order.
REPO_DIR=""
WRITE_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --apply) WRITE_FLAG="--write" ;;
    *) REPO_DIR="$arg" ;;
  esac
done

HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$HUB_ROOT/portfolio-manifest.yaml"
REPO_DIR="${REPO_DIR:-$HOME/PycharmProjects/$SLUG}"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found" >&2
  exit 1
fi
if [ ! -d "$REPO_DIR" ]; then
  echo "ERROR: repo dir not found: $REPO_DIR" >&2
  echo "  Pass the consumer repo path explicitly:" >&2
  echo "    bash scripts/customize-metadata.sh $SLUG /path/to/repo [--apply]" >&2
  exit 1
fi

echo "== Customising metadata for '$SLUG' =="
echo "  manifest: $MANIFEST"
echo "  repo:     $REPO_DIR"
[ -n "$WRITE_FLAG" ] && echo "  mode:     APPLY" || echo "  mode:     dry run (pass --apply to write)"
echo ""

node "$HUB_ROOT/scripts/_customize-metadata.mjs" "$MANIFEST" "$SLUG" "$REPO_DIR" $WRITE_FLAG
