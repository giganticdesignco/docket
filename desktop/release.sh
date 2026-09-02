#!/usr/bin/env bash
# Cut a new build of the Mac shell.
#
#   ./release.sh 0.2.0 "Drag and drop fixes"
#
# Bumps the version in tauri.conf.json, Cargo.toml, and package.json,
# builds the DMG, and writes ../public/desktop/latest.json so the app
# shows its update banner once the site deploys. Then two things are
# yours to do, printed at the end: upload the DMG to the public
# "desktop" bucket in Supabase Storage, and commit and push.
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${1:-}"
NOTES="${2:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: ./release.sh <major.minor.patch> [notes]" >&2
  exit 1
fi

BUCKET_URL="https://cnnrtsnevmjqhfgpolfo.supabase.co/storage/v1/object/public/desktop"
DMG_NAME="Docket-${VERSION}.dmg"

sed -i '' "s/^  \"version\": \".*\"/  \"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
sed -i '' "s/^  \"version\": \".*\"/  \"version\": \"${VERSION}\"/" package.json

npm run build

BUILT=$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -1)
OUT="$HOME/Desktop/${DMG_NAME}"
cp "$BUILT" "$OUT"

cat > ../public/desktop/latest.json <<EOF
{
  "version": "${VERSION}",
  "url": "${BUCKET_URL}/${DMG_NAME}",
  "notes": "${NOTES//\"/\\\"}",
  "published_on": "$(date +%F)"
}
EOF

echo
echo "Built ${OUT}"
echo
echo "Now:"
echo "  1. Upload ${DMG_NAME} to Supabase Storage, bucket \"desktop\" (Storage in the dashboard)."
echo "     It must be named exactly ${DMG_NAME}."
echo "  2. Commit and push. The site deploys latest.json and every open"
echo "     Mac app shows the update banner within a day, or on next launch."
