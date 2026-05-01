#!/usr/bin/env bash
# Publish already-built hub packages using current gh auth token (which
# should now have write:packages scope). Writes a temporary package-local
# .npmrc with the token, publishes, then cleans up.

HUB=/c/Users/denni/PycharmProjects/cais-shared-services/packages
TOKEN=$(gh auth token)

# Packages in order; all should already be built with dist/
PKGS=(platform-trust-middleware property-services-sdk coordination-sdk nudge-core mapbox security-gate agent-trust-score)

for pkg in "${PKGS[@]}"; do
  dir="$HUB/$pkg"
  [ -d "$dir/dist" ] || { echo "  skip $pkg (no dist/)"; continue; }

  cd "$dir"

  # Write temporary .npmrc with the token inline
  cat > .npmrc.publish <<EOF
//npm.pkg.github.com/:_authToken=$TOKEN
EOF

  # Publish using the temp npmrc
  result=$(npm publish --userconfig .npmrc.publish 2>&1)

  # Clean up immediately
  rm -f .npmrc.publish

  if echo "$result" | grep -q "npm error"; then
    err=$(echo "$result" | grep -E "npm error" | head -2 | tr '\n' ' ')
    echo "  ERR  $pkg: $err"
  elif echo "$result" | grep -q "403\|401"; then
    echo "  ERR  $pkg: auth failure"
  else
    # Extract version from package.json
    v=$(node -e "console.log(require('./package.json').version)")
    echo "  OK   $pkg@$v"
  fi
done

echo ""
echo "Verifying published versions..."
for pkg in "${PKGS[@]}"; do
  # Unset any token to force fresh fetch
  v=$(npm view @caistech/$pkg version --registry=https://npm.pkg.github.com 2>&1 | grep -v "npm warn\|^$" | tail -1)
  echo "  @caistech/$pkg = $v"
done
