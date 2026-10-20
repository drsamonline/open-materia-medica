#!/bin/bash
# Copy the site (the repository root) into the Android project's assets.
# The site is kept once, at the repo root, so the two can never drift apart.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
dest="$here/app/src/main/assets/site"
rm -rf "$dest"
mkdir -p "$dest"
cd "$root"
# everything that makes up the site, but not the repo scaffolding or the app source
tar -cf - \
  --exclude='./android' --exclude='./.git' --exclude='./.nojekyll' \
  --exclude='./LICENSE' --exclude='./README.md' \
  . | ( cd "$dest" && tar -xf - )
echo "site synced into $dest ($(find "$dest" -type f | wc -l) files)"
