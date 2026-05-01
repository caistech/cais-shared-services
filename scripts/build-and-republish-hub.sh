#!/usr/bin/env bash
# Build + republish all consumer-facing @caistech/* hub packages with
# compiled dist/ output. Run from anywhere.

set -e

HUB=/c/Users/denni/PycharmProjects/cais-shared-services/packages

# Use associative-array-ordered list via parallel arrays to keep portable
PKGS=(
  "platform-trust-middleware:0.3.0"
  "property-services-sdk:0.2.0"
  "coordination-sdk:0.3.0"
  "nudge-core:0.2.0"
  "mapbox:0.1.1"
  "security-gate:0.2.0"
  "agent-trust-score:0.2.0"
)

for entry in "${PKGS[@]}"; do
  pkg="${entry%:*}"
  newv="${entry#*:}"
  dir="$HUB/$pkg"

  [ -f "$dir/package.json" ] || { echo "skip $pkg"; continue; }

  echo "=== $pkg → $newv ==="

  cd "$dir"

  # 1. Build (produces dist/)
  rm -rf dist
  npm run build 2>&1 | tail -3

  # 2. Update package.json in place using node (relative path — no Git Bash /c/ issue)
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    p.version = '$newv';
    p.type = 'module';
    p.main = 'dist/index.js';
    p.types = 'dist/index.d.ts';
    if (p.exports && typeof p.exports === 'object') {
      const ne = {};
      for (const [k, v] of Object.entries(p.exports)) {
        ne[k] = (typeof v === 'string')
          ? v.replace('./src/', './dist/').replace(/\.ts\$/, '.js')
          : v;
      }
      p.exports = ne;
    }
    p.files = ['dist/'];
    fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
    console.log('  package.json updated');
  "

  # 3. Publish
  npm publish 2>&1 | grep -E '\\+ @|npm ERR|npm notice Publishing' | head -4 || true
  echo ""
done

echo "=== done ==="
