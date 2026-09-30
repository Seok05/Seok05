#!/bin/sh
# Recount languages across my local repos (public and private) and publish
# the "Most used languages" card. Works from any directory:
#   sh ~/Desktop/Seok05/scripts/refresh-languages.sh
set -e
cd "$(dirname "$0")/.."
git pull --rebase -q
node scripts/languages.mjs "$@"
node scripts/update-blog.mjs --languages
git add assets/languages.json assets/langs-light.svg assets/langs-dark.svg
if git diff --cached --quiet; then
  echo "no change, nothing to push"
else
  git commit -qm "chore: refresh language stats"
  git push -q
  echo "pushed, the profile shows the new numbers within a few minutes"
fi
