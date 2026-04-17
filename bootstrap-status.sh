#!/usr/bin/env bash
# Bootstrap PROJECT_STATUS.md across all projects in PycharmProjects
# Run once: bash packages/corporate-ai-common/bootstrap-status.sh

TEMPLATE="$HOME/PycharmProjects/packages/corporate-ai-common/PROJECT_STATUS_TEMPLATE.md"
BASE="$HOME/PycharmProjects"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

for dir in "$BASE"/*/; do
  # Skip non-project dirs
  name=$(basename "$dir")
  [[ "$name" == "packages" ]] && continue
  [[ "$name" == "apps" ]] && continue
  [[ "$name" == "TourLingo - Copy" ]] && continue

  # Skip if already has one
  [[ -f "$dir/PROJECT_STATUS.md" ]] && continue

  # Check if it's a real project (has package.json or manage.py or similar)
  if [[ -f "$dir/package.json" ]] || [[ -f "$dir/apps/frontend/package.json" ]] || [[ -d "$dir/tenderwatch" ]]; then
    sed "s/{{PROJECT_NAME}}/$name/g; s/{{TIMESTAMP}}/$NOW/g" "$TEMPLATE" > "$dir/PROJECT_STATUS.md"
    echo "Created: $dir/PROJECT_STATUS.md"
  fi
done

echo "Done."
