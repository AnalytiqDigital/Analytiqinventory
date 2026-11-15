#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install
pnpm --filter @analytiq/desktop typecheck
pnpm --filter @analytiq/desktop lint
pnpm --filter @analytiq/desktop test
pnpm --filter @analytiq/desktop build
echo "Batch 2 verification passed. Installer: apps/desktop/release/*.exe"
