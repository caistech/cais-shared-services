#!/usr/bin/env bash
# Bump consumer deps. Uses relative paths to avoid Node's /c/ → C:\c\ path issue.

BASE=/c/Users/denni/PycharmProjects

# Pairs: repo name | relative package.json path
ENTRIES=(
  "MMCBuild|package.json"
  "DealFindrs|package.json"
  "F2K-Checkpoint-Latest|package.json"
  "property-services|package.json"
  "platform-trust|package.json"
  "Connexions|package.json"
  "Kira|package.json"
  "SmartBoard|package.json"
  "LaunchReady|package.json"
  "storefront-mcp|package.json"
  "universal-interviews|package.json"
  "RaiseReadyTemplate|package.json"
  "gbta-openclaw|package.json"
  "easy-claude-code|apps/frontend/package.json"
  "HairStylistAI|package.json"
)

for entry in "${ENTRIES[@]}"; do
  repo="${entry%|*}"
  rel="${entry#*|}"
  dir="$BASE/$repo"
  [ -f "$dir/$rel" ] || { echo "  skip $repo"; continue; }

  cd "$dir"
  # cd to dirname of rel so Node can use relative path
  cd "$(dirname "$rel")"
  fname=$(basename "$rel")

  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$fname', 'utf8'));
    const targets = {
      '@caistech/platform-trust-middleware': '^0.3.0',
      '@caistech/property-services-sdk': '^0.2.0',
      '@caistech/coordination-sdk': '^0.3.0',
      '@caistech/nudge-core': '^0.2.0',
      '@caistech/mapbox': '^0.1.1',
      '@caistech/security-gate': '^0.2.0',
      '@caistech/agent-trust-score': '^0.2.0',
    };
    let changed = 0;
    const changes = [];
    for (const section of ['dependencies', 'devDependencies']) {
      if (!p[section]) continue;
      for (const [pkg, newv] of Object.entries(targets)) {
        if (p[section][pkg] && p[section][pkg] !== newv) {
          changes.push(pkg + ': ' + p[section][pkg] + ' → ' + newv);
          p[section][pkg] = newv;
          changed++;
        }
      }
    }
    if (changed > 0) {
      fs.writeFileSync('$fname', JSON.stringify(p, null, 2) + '\n');
      console.log('  UPDATED $repo:');
      for (const c of changes) console.log('    ' + c);
    } else {
      console.log('  noop    $repo');
    }
  "
done
