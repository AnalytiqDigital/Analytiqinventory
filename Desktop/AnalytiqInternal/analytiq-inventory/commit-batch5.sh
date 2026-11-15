#!/bin/sh
# Stages and commits the Batch 5 restaurant-pack + login-slideshow work.
set -e

cd "C:/Users/emman"

PREFIX="Desktop/AnalytiqInternal/analytiq-inventory"

git rm -r --cached --quiet "$PREFIX/apps/cloud-api/tsconfig.tsbuildinfo" 2>/dev/null || true
git add "$PREFIX"
git commit -q -F "$PREFIX/.commit-msg.tmp" --cleanup=verbatim
rm -f "$PREFIX/.commit-msg.tmp"
git log --oneline -1
