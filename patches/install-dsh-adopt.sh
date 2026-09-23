#!/usr/bin/env bash
# Install the sessions-adopt client bundle into an installed DSH.
#
# The patch that lets a plugin render a Session it does not own lives in
# `@deepseek-ai/dsh-api-session-controller/lib/client.js` — the only file that
# differs from the published build. This script finds every installed copy of
# that package under npm's npx cache, backs the file up beside itself, and
# replaces it, so a version bump (which mints a fresh cache directory) can be
# repaired by running it again.
#
# Usage:  ./install-dsh-adopt.sh [--check]
#   --check   report what would change, write nothing
#
# Only the version the bundle was built from is touched: the client bundle and
# the shell that loads it are built together, so dropping a 0.1.7-alpha.2 bundle
# into an older cache entry would break that install rather than patch it.
# Override with DSH_SESSION_CONTROLLER_VERSION=<version>.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$HERE/dsh-api-session-controller-client.js"
PACKAGE="@deepseek-ai/dsh-api-session-controller/lib/client.js"
TARGET_VERSION="${DSH_SESSION_CONTROLLER_VERSION:-0.1.7-alpha.2}"
MARKER="is a mirror and accepts no prompt"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

[ -f "$BUNDLE" ] || { echo "missing bundle: $BUNDLE" >&2; exit 1; }
STAMP="$(date +%Y-%m-%d-%H%M%S)"
FOUND=0
PATCHED=0

# Every place an installed DSH can keep this package: the npx cache, a global
# install, and a project-local install. Whichever exist are considered.
while IFS= read -r target; do
  FOUND=1
  package_dir="$(dirname "$(dirname "$target")")"
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$package_dir/package.json" | head -1)"
  if [ "$version" != "$TARGET_VERSION" ]; then
    echo "skipped ($version): $target"
    continue
  fi
  if grep -q "$MARKER" "$target" 2>/dev/null; then
    echo "already patched: $target"
    PATCHED=1
    continue
  fi
  if [ "$CHECK" = "1" ]; then
    echo "would patch:     $target"
    PATCHED=1
    continue
  fi
  cp -a "$target" "$target.bak-$STAMP"
  cp "$BUNDLE" "$target"
  echo "patched:         $target   (backup: client.js.bak-$STAMP)"
  PATCHED=1
done < <(find /root/.npm/_npx /usr/lib/node_modules /usr/local/lib/node_modules "$HOME/.local/share/pnpm/global" \
  -path "*/$PACKAGE" -type f 2>/dev/null | sort -u)

if [ "$FOUND" = "0" ]; then
  echo "no installed copy of $PACKAGE found; pass the path to this script if your DSH lives elsewhere" >&2
  exit 1
fi
if [ "$PATCHED" = "0" ]; then
  echo "no install of $TARGET_VERSION found; set DSH_SESSION_CONTROLLER_VERSION to patch another one" >&2
  exit 1
fi

if [ "$CHECK" = "0" ]; then
  echo
  echo "Restart the service so the host re-reads the bundle:"
  echo "  systemctl restart dsh-web"
  echo "and hard-refresh the browser (the page keys plugin bundles by revision)."
fi
