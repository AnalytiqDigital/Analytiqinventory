# Changelog

## 0.7.0 — Batch 6: customers, suppliers, purchasing

- Customers with credit limits and a derived balance: a sale marked *Credit
  (pay later)* puts the bill on the customer's account, the limit is checked
  before the sale is written, and part-cash/part-credit works by splitting the
  tender. Payments recorded against the account reduce the balance; a customer
  who still owes cannot be archived.
- Suppliers contact book, and a purchase ledger: purchases are recorded as
  drafts, and *Receive* is the only thing that moves stock — one movement per
  line, in a single transaction, refused on a second receive.
- Desktop: new Customers, Suppliers and Purchases pages (search, filters,
  expandable purchase lines, multi-line item editor); POS gains a customer
  selector that unlocks the credit tender and a "put remaining on credit"
  shortcut; sale views carry the customer name.
- Upgrades: migration 0007 grants the three new permissions to existing
  Administrator and Manager roles, and customer balances now count credit
  tenders only, so a paid sale to a named customer is not treated as debt.
- Tests: `batch6.test.ts` covering customer CRUD and validation, credit limits
  and settlement, split tender, the permission backfill, suppliers, and the
  purchase lifecycle.

## 0.6.0 — Restaurant pack: tables, product photos, tax categories, barcode

- Named tax categories (Food 7.5%, Alcohol 10%, Exempt 0%) in basis points,
  one default per business; products carry a category, and each sale line is
  taxed at its own rate with the business rate as fallback. Header discounts
  spread proportionally across lines.
- Dining tables with a free/occupied floor map: add, rename, delete, mark
  busy/free, and start an order straight from a table. Sales are validated
  against the table, occupy it within the checkout transaction and release it
  once the sale completes; occupied tables reject new sales.
- Product photos stored inline as downscaled JPEG data URLs, so imagery works
  fully offline and travels inside the single SQLite backup. EAN-13 barcode
  generator on the product form.
- Desktop: table selector bar on the POS with per-line tax estimate, table name
  on the cart, receipt and sales history; new Tables and Tax Categories pages;
  thumbnails in the products list, product detail and POS grid.
- Tests: `restaurant.test.ts` covering tax CRUD, per-category tax math, product
  image/tax fields, and the table lifecycle with sale tagging.

## 0.5.0 — Batch 5: POS and Cash Register

- Sales ledger: `sales` + items + payments + reversals; receipt numbers
unique per business; money in integer kobo.
- Atomic checkout: cart validation, line + header discounts, tax default
from business rate, split tender (cash/transfer/pos/credit), stock guard
per line — all in one transaction with audit rows.
- Refunds/voids restock via offsetting `return` rows with reversal
records; sales never deleted; double reversal rejected.
- Desktop: POS page with product search, cart editing, tender dialog,
printable receipts (thermal + standard printers), sales history with
refund/void flows.
- Permission-gated writes (`sales.create`, `sales.refund`);
authenticated IPC for all sales channels.
- Tests: service lifecycle, validation schemas. Docs: `docs/POS.md`.

## 0.4.0 — Batch 4: Products and Inventory

- Product catalog: categories, SKU/barcode uniqueness per business, kobo
  pricing, reorder levels, archive/restore (no deletes).
- Append-only stock ledger: `stock_movements` with running `qty_after`;
  on-hand derived by `SUM(qty_delta)`; negative stock rejected.
- Atomic operations: product + opening stock, adjustments, counts — each
  in a single transaction with audit rows.
- Desktop: products table (search/filter/pagination), product detail with
  per-location levels and movement history, inventory page with
  adjust/count dialogs and low-stock filter.
- Permission-gated writes (`products.manage`, `inventory.adjust`);
  authenticated IPC for all inventory channels.
- Tests: service lifecycle, validation schemas, money helpers. Docs:
  `docs/PRODUCTS_INVENTORY.md`.

## 0.3.0 — Batch 3: Database, Authentication and Business Setup

- SQLite schema for 9 entities + settings/meta; UUID PKs, tenant scoping,
  version columns, unique business email.
- File-based SQL migration chain + runner with applied-migration tracking.
- Atomic first-run setup: business, default location, permission catalogue,
  system roles, admin user, settings, audit record.
- Login/logout with scrypt verification, 5-strike/15-min lockout, 12 h token
  sessions (hash stored, token in main-process memory only).
- Desktop IPC auth channels, real session store, auth-gated routing,
  setup wizard, login page, permission-filtered navigation.
- Tests: DB lifecycle, validation schemas, session store. Docs: `docs/AUTH.md`.

## 0.2.0 — Batch 2: Desktop Foundation and User Interface

- App shell: hash router, Sidebar + mobile drawer, Topbar (search, theme,
  notifications, account menu), dashboard layout with responsive max-width.
- All 12 required nav sections routed; Dashboard metric cards + state preview;
  unfinished sections labelled with target batch via PlaceholderPage.
- Stores: persisted light/dark theme, notification centre (50-cap), placeholder
  session store (Batch 3 replaces with real auth).
- UI kit: Button, Card, Input, Badge, Table, Modal, Drawer, Loading/Empty/Error,
  ConfirmDialog, ErrorBoundary.
- Secure Electron: validated `app:log` channel, typed renderer IPC client,
  electron-log file transport, hardened BrowserWindow defaults.
- Packaging: `electron/tsconfig.json` → `dist-electron`, NSIS per-user config.
- Tests: Button variants, state components, ConfirmDialog confirm/cancel,
  theme toggle persistence.

## 0.1.0 — Batch 1: Foundation and Architecture

- Monorepo scaffold: `apps/*`, `packages/*`, pnpm workspaces, Turboreo.
- Strict TypeScript base, ESLint, Prettier, Vitest, Playwright configs.
- Desktop shell: Electron main/preload/renderer, Vite, React, Tailwind.
- Local-server stub: Fastify + Swagger + `/health`.
- Cloud-api stub: NestJS + Swagger + `/health`.
- Website stub: Next.js home page.
- Shared packages: shared-types, validation, business-logic, database,
  sync-engine, licensing-sdk, shared-ui.
- Docs: ARCHITECTURE, DATABASE_DESIGN, API_DESIGN, SECURITY,
  DEVELOPMENT_ROADMAP, DECISIONS.
