#!/usr/bin/env bash
# Copy the order and lead files off the Docker volume, then prune old copies.
# Usage: ./backup.sh [destination]   (default: ./backups)
set -euo pipefail

cd "$(dirname "$0")"
DEST="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DEST"

docker run --rm \
  -v analytiq-data:/data:ro \
  -v "$(cd "$DEST" && pwd)":/backup \
  alpine:3.20 \
  tar czf "/backup/analytiq-data-$STAMP.tar.gz" -C /data .

# Keep the newest 14 archives.
ls -1t "$DEST"/analytiq-data-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "Wrote $DEST/analytiq-data-$STAMP.tar.gz"
