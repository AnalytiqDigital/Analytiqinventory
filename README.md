# AnalytIQ Inventory & POS — Monorepo

Commercial-grade inventory and Point of Sale application for Nigerian SMEs.
Offline-first, standalone + LAN modes, optional cloud services.

> Batch 4: Products + inventory ledger implemented (unverified builds — run a
> verify script locally). Auth/setup (Batch 3) and desktop shell (Batch 2)
> in place. POS sales flow arrives in Batch 5.

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

## Rules (abridged)

1. TypeScript strict everywhere. 2. Zod validation client + server.
3. Drizzle migrations for every schema change. 4. Money in integer minor units (kobo).
5. UUIDs for syncable records. 6. Offline-first core sales. 7. Never commit secrets.

Full rules: see the master Batch prompt, Part 2.
