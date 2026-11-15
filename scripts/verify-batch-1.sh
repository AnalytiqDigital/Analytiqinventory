#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
echo "Batch 1 verification passed."
