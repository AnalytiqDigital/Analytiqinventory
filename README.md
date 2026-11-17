# AnalytIQ Inventory & POS — Monorepo

Inventory and Point of Sale application for Nigerian SMEs. Offline-first
standalone desktop with a LAN server for multi-register shops; cloud services
arrive in later batches.

> Batch 7: one primary computer hosts the SQLite database behind a Fastify +
> Socket.IO LAN server; other computers run the same desktop app in client mode
> and never open SQLite. Reporting, staff management, settings, cloud sync,
> licensing, AI and release tooling remain in later batches — see
> `docs/DEVELOPMENT_ROADMAP.md` and `docs/LAN_SETUP.md`.

## Structure

```text
analytiq-inventory/
├── apps/
│   ├── desktop/       # Electron + React + Vite + TypeScript
│   ├── local-server/  # Fastify LAN server
│   ├── cloud-api/     # NestJS cloud backend
│   └── website/       # Next.js sales website & customer portal
├── packages/
│   ├── shared-types/
│   ├── validation/
│   ├── business-logic/
│   ├── database/
│   ├── sync-engine/
│   ├── licensing-sdk/
│   └── shared-ui/
├── docs/
├── scripts/
└── tests/
```

See `docs/ARCHITECTURE.md` for the full design.
See `PROJECT_STATUS.md` for batch progress.

## Prerequisites

- Node.js 20 LTS
- pnpm 9 (`npm install -g pnpm`)
- Windows 10/11 for installer builds
- No XAMPP / MySQL required. SQLite is embedded.
- No real secrets committed — copy `.env.example` files to `.env` locally.

## Quick start

```bash
pnpm install
pnpm build        # turbo: build all workspaces
pnpm typecheck    # turbo: strict TS checks
pnpm lint
pnpm test         # vitest run (all workspaces)
```

Per app:

```bash
pnpm --filter @analytiq/desktop dev
pnpm --filter @analytiq/local-server dev
pnpm --filter @analytiq/cloud-api dev
pnpm --filter @analytiq/website dev
```

### Testing note

`better-sqlite3` is built for Electron's ABI in this workspace, so the database
and LAN-server suites must run under Electron's Node:

```bash
cd packages/database
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run

cd apps/local-server
ELECTRON_RUN_AS_NODE=1 ../desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

The validation and desktop suites run under normal Node with `pnpm test`.

## Rules (abridged)

1. TypeScript strict everywhere. 2. Zod validation client + server.
3. Drizzle migrations for every schema change. 4. Money in integer minor units (kobo).
5. UUIDs for syncable records. 6. Offline-first core sales. 7. Never commit secrets.

Full rules: see the master Batch prompt, Part 2.
