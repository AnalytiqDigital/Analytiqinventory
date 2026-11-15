#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install
pnpm --filter @analytiq/validation typecheck
pnpm --filter @analytiq/validation test
pnpm --filter @analytiq/database typecheck
pnpm --filter @analytiq/database test
pnpm --filter @analytiq/desktop typecheck
pnpm --filter @analytiq/desktop lint
pnpm --filter @analytiq/desktop test
echo "Batch 3 verification passed."
