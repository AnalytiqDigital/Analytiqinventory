# AnalytIQ Inventory & POS — Monorepo

Inventory and Point of Sale application for Nigerian SMEs. The desktop app runs
offline on the shop computer, a LAN server shares one database across tills, and
the website sells signed licence keys that activate offline.

Everything in the commercial roadmap is implemented: POS and stock ledger,
customers/suppliers/purchasing, reports, LAN mode, branch sync, verified
backups, WhatsApp/AI alerts, offline licensing, online checkout, bulk CSV
import, thermal receipt printing (Xprinter 58/80 mm) and barcode scanning.

## Structure

```text
analytiq-inventory/
├── apps/
│   ├── desktop/       # Electron + React + Vite + TypeScript
│   ├── local-server/  # Fastify + Socket.IO LAN server
│   ├── cloud-api/     # NestJS: plans, Paystack checkout, key issuance
│   └── website/       # Next.js sales site, checkout and key delivery
├── packages/
│   ├── business-logic/
│   ├── database/      # Drizzle schema, migrations and services (SQLite)
│   ├── licensing/     # Ed25519 licence verify/issue, trial state
│   ├── shared-types/
│   ├── sync-engine/   # Branch sync client
│   └── validation/    # Zod schemas + commercial plan catalogue
├── docs/
├── scripts/
└── tests/
```

- Full design: `docs/ARCHITECTURE.md`
- Batch progress: `PROJECT_STATUS.md` and `docs/DEVELOPMENT_ROADMAP.md`

## Documentation

| Area                   | Doc                                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| POS, stock, purchasing | `docs/POS.md`, `docs/PRODUCTS_INVENTORY.md`, `docs/CUSTOMERS_PURCHASING.md` |
| Reports                | `docs/REPORTING.md`                                                         |
| Expenses and profit    | `docs/FINANCE.md`                                                           |
| Staff and permissions  | `docs/STAFF.md`                                                             |
| Buyer setup sheet      | `docs/BUYER_SETUP.md`                                                       |
| LAN / multi-till       | `docs/LAN_SETUP.md`                                                         |
| Branch sync            | `docs/SYNC.md`                                                              |
| Backups and restore    | `docs/BACKUPS.md`                                                           |
| Offline licence keys   | `docs/LICENSE_KEYS.md`                                                      |
| Online checkout        | `docs/CHECKOUT.md`                                                          |
| WhatsApp / AI alerts   | `docs/AUTOMATION.md`                                                        |
| CSV import             | `docs/IMPORT.md`                                                            |
| Printers and scanners  | `docs/PRINTERS.md`                                                          |
| Installer and updates  | `docs/UPDATES.md`                                                           |
| Release checklist      | `docs/RELEASE_CHECKLIST.md`                                                 |
| Security rules         | `docs/SECURITY.md`                                                          |

## Prerequisites

- Node.js 20+
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

`better-sqlite3` is built for Electron's ABI in this workspace, so suites that
open SQLite (database, local-server, licensing, desktop main-process) must run
under Electron's Node:

```bash
cd packages/database
ELECTRON_RUN_AS_NODE=1 ../../apps/desktop/node_modules/electron/dist/electron.exe \
  node_modules/vitest/vitest.mjs run
```

`@analytiq/validation`, `@analytiq/cloud-api`, `@analytiq/website` and the
desktop renderer suites run under plain Node with `pnpm test`. Build
`@analytiq/validation` before typechecking consumers — they resolve its
CommonJS `dist`.

### Windows installer

```bash
cd apps/desktop
pnpm build:electron   # typecheck + esbuild bundle of main/preload
pnpm build:renderer
pnpm dist             # electron-builder --win nsis
```

Output: `apps/desktop/release/AnalytIQ-Inventory-Setup-<version>.exe`
(`release/` and the `.ebcache/` builder cache are git-ignored).

The main process is bundled with esbuild because electron-builder only copies
top-level packages from pnpm's strict `node_modules` layout. `electron`,
`@analytiq/database` and `better-sqlite3` stay external; the native module is
listed in `asarUnpack` so `better_sqlite3.node` loads from
`app.asar.unpacked`. Migrations ship inside `@analytiq/database/drizzle`.

If electron-builder cannot extract its code-signing cache (symlink privilege
required on Windows), point `ELECTRON_BUILDER_CACHE` at a pre-extracted cache —
`.ebcache/` in this repo is used for that and is git-ignored. See
`docs/UPDATES.md` for the one-time steps.

The installer is **unsigned** until a code-signing certificate is configured
(`pnpm dist:signed`). Windows still installs it: SmartScreen shows
"Windows protected your PC" → **More info** → **Run anyway**, and UAC shows
*Unknown publisher*. The customer-facing steps are in `docs/BUYER_SETUP.md`.

## Selling a licence

1. Generate the vendor keypair once
   (`pnpm --filter @analytiq/licensing keygen`). The public key is embedded in
   the app; the private key stays in `.secrets/` (git-ignored) and on the server.
2. Run `apps/cloud-api` with `PAYSTACK_SECRET_KEY` and the private key path; run
   `apps/website` with `NEXT_PUBLIC_API_URL` pointing at it.
3. Point the Paystack webhook at `/api/payments/paystack/webhook`.

Plans and prices live in `packages/validation/src/index.ts` so the website and
the API can never disagree. See `docs/CHECKOUT.md` for the full flow.

## Rules (abridged)

1. TypeScript strict everywhere. 2. Zod validation client + server.
2. Drizzle migrations for every schema change. 4. Money in integer minor units (kobo).
3. UUIDs for syncable records. 6. Offline-first core sales. 7. Never commit secrets.
