#!/usr/bin/env bash
# Sync the @cross-deck/cli package from this monorepo to the public
# repo at https://github.com/VistaApps-za/crossdeck-cli.
#
# We develop in the monorepo (alongside backend + dashboard + the
# other SDKs) and mirror the CLI directory to its public home before
# each release. This script does that mirror in one command — same
# pattern as sdks/node/sync-to-public-repo.sh.
#
# Usage:
#   ./sync-to-public-repo.sh                       # dry run, no commit
#   ./sync-to-public-repo.sh "Release v1.0.0"     # sync + commit + push
#
# Prereqs:
#   - gh CLI authenticated against the VistaApps-za GitHub account
#   - https://github.com/VistaApps-za/crossdeck-cli exists
#   - This monorepo working tree is clean (changes committed)

set -euo pipefail

PUBLIC_REPO="VistaApps-za/crossdeck-cli"
LOCAL_CLONE="${TMPDIR:-/tmp}/crossdeck-cli-sync"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMIT_MSG="${1:-Sync from monorepo}"

echo "→ Cloning $PUBLIC_REPO to $LOCAL_CLONE"
rm -rf "$LOCAL_CLONE"
gh repo clone "$PUBLIC_REPO" "$LOCAL_CLONE" -- --quiet

echo "→ Mirroring monorepo CLI source"
find "$LOCAL_CLONE" -mindepth 1 -maxdepth 1 \
  ! -name ".git" -exec rm -rf {} +

rsync -a \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=coverage \
  --exclude=.DS_Store \
  "$HERE"/ "$LOCAL_CLONE"/

cat > "$LOCAL_CLONE/.gitignore" <<'EOF'
node_modules/
dist/
coverage/
.DS_Store
*.log
.env
.env.*
EOF

cd "$LOCAL_CLONE"

if [[ -z "$(git status --porcelain)" ]]; then
  echo "→ No changes to mirror — the public repo is already in sync."
  exit 0
fi

echo "→ Diff against public repo:"
git status --short
echo

if [[ "${1:-}" ]]; then
  git add -A
  git -c user.name="Crossdeck" -c user.email="noreply@cross-deck.com" \
      commit -m "$COMMIT_MSG"
  git push origin main
  echo
  echo "✓ Pushed to https://github.com/$PUBLIC_REPO"
else
  echo "→ Pass a commit message to actually push:"
  echo "    ./sync-to-public-repo.sh \"Release v1.0.0\""
  echo
  echo "Cloned mirror is at: $LOCAL_CLONE"
fi
