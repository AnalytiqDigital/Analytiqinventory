# Changelog

## Unreleased — Batch 16: shop masters, returns, labels and report menu

- **Grouped, collapsible sidebar**: the menu now mirrors the reference ERP with
  Main, Sell, Products, Inventory, Purchases, Contacts, Reports, Finance and
  Setup groups. Each group collapses from its header and the choice is
  remembered per browser (`analytiq.nav.collapsed`). Group headers hide when no
  item inside is visible, so permissions and installed modules still decide the
  menu.
- **Units, Brands & Groups** (`/masters`): manage units (with short name),
  brands, warranties (with duration in days) and customer groups in one tabbed
  screen. Products can store a brand and a warranty; the customer form can
  store a group.
- **Stock adjustments** (`/stock-adjustments`): list past adjustments with
  branch, reason, lines and signed quantity, and record new `ADJ-000001`
  adjustments with plus/minus lines per product. Lines that would take stock
  below zero are refused (`NEGATIVE_STOCK`); every write is audited.
- **Purchase returns** (`/purchase-returns`): return received stock to a
  supplier with `PRT-000001` references, per-line quantities capped by what is
  still returnable on that purchase, and a value total at the purchase's unit
  cost. Restocking uses the `purchase_return` movement kind.
- **Print labels** (`/labels`): search products, pick copies per row or select
  all, optionally hide products without a barcode, and print 50×30 mm labels on
  A4 with the business name, product name, price and an inline EAN-13 barcode
  (plain code when the barcode is not EAN-13). Printing uses a hidden iframe so
  no popup blocker is involved.
- **Report menu**: the Reports screen gains ten tabs — Purchase & Sale, Tax,
  Suppliers & Customers, Customer Groups, Stock Adjustments, Product Purchases,
  Purchase Payments, Sell Payments, Registers and Sales Representatives — all
  driven by one `reports:menu` (LAN `GET /api/reports/menu`) call for the
  selected date range.
- **Users & Roles**: the staff screen now has Users and Roles tabs instead of
  stacking both cards.
- **Imports**: opening stock (`opening-stock`) sets the on-hand quantity per
  branch, matched by barcode, then SKU, then name, and re-importing the same
  file is idempotent; contacts (`contacts`) imports customers and suppliers in
  one file with type, phone, email, address and an existing customer group.
  Both kinds are importable from Products (opening stock) and Customers
  (contacts), with downloadable templates.
- LAN parity: `GET/POST /api/masters/:kind`, `PATCH /api/masters/:kind/:id`,
  `GET/POST /api/stock-adjustments`, `GET/POST /api/purchase-returns`,
  `GET /api/reports/menu`, `POST /api/import/opening-stock` and
  `POST /api/import/contacts`; IPC mirrors each route for the primary computer.

## Unreleased — Batch 15: business pack

- **Install Modules**: the app now installs a different set of optional
  modules per business type (retail, supermarket, wholesale, pharmacy,
  restaurant, bar/lounge, electronics, boutique, services) and a manager can
  switch any module on or off from Settings. The menu, screens and POS update
  immediately; hidden modules keep their data.
- **Batches & Expiry**: track batches with expiry dates on chosen products,
  receive them from Purchases or the new Batches screen, sell First Expired
  First Out, and see OK / expiring / expired badges with 30/90-day filters.
- **Price lists**: wholesale and customer price tiers with per-product
  override prices; a customer's tier is applied automatically on Sell and the
  cashier can still override.
- **Loyalty and CRM**: points ledger with configurable earn and redemption
  rates, redemption as a discount on the sale, points shown on receipts, and a
  customer profile with visit summary, point adjustments and notes.
- **Counter returns**: receipt lookup, per-line returnable quantities, capped
  refunds across partial returns, restock to the original batches, exchange
  tagging and return history. Batched sales now restock to their exact batch.
- **Branch transfers**: move stock between branches with paired ledger rows,
  batch identity preserved, guards against same-branch and negative-stock
  transfers, and a `TRF-` history.
- **Debtor reminders**: outstanding balance list with opt-in selection, a
  dry-run preview when WhatsApp is not configured, and a reminder log.
- **Encrypted offsite backup**: AES-256-GCM `.aqb` snapshot with a passphrase
  (scrypt), uploaded to any HTTPS PUT endpoint with a bearer key; restore needs
  the passphrase, which never leaves the machine.
- LAN parity for all new routes and migration `0013_business_pack.sql`.
- **Fix**: opening Products or Sell after the Tax Categories settings screen
  could crash the window (`find is not a function`) because the shared
  tax-category cache held two different shapes. All screens now share one query
  helper that always returns a plain list.
- **Dashboard analytics**: the home screen now leads with today's sales and
  basket, month gross and net profit with margins, credit, low stock and stock
  value, cash and transfer received today, a seven-day trend, payment mix,
  best-selling products with margin, sales by cashier and a profit snapshot.
  Cashiers without `reports.view` keep the original sales-list tiles.
- **Accounting page**: new `/accounting` screen (Reports-permission) with an
  overview, a formal profit and loss statement (net sales after discounts and
  loyalty, COGS, gross profit, expenses, net profit, tax shown as collected)
  and a product sales statement (quantity, revenue, COGS, profit, margin and
  share per product). Date presets, last month, custom range and CSV export;
  statement arithmetic is unit-tested (`statements.test.ts`).
- **Expenses module**: new optional `expenses` module (installed by default for
  every business type, switchable in Install modules) with a dedicated
  `/expenses` ledger. Date presets, category filter, note search, selection
  totals (total spent, entries, average, biggest category), add/edit/delete
  and a filtered CSV export. Menu and route require `finance.manage` and the
  installed module; Finance keeps the profit statement.
- Expenses can now be edited (`PATCH /api/finance/expenses/:id`, IPC
  `finance:update-expense`) with an `expense.update` audit entry.
- **Website**: one package at ₦80,000/year for one location replaces the
  Starter/Standard/Pro tiers. The landing page was rebuilt on the mockup with
  warehouse, supermarket and POS computer imagery, a welcoming emerald/cream
  palette, a cloud-version card and a quote form that opens WhatsApp with the
  branch details prefilled. Checkout shows the single package; cloud-api prices
  follow the same catalogue. The screens section now opens with three real app
  captures: the Reports screen and both sign-in screens.
- Docs: `docs/BUSINESS_PACK.md`; updated `docs/CHECKOUT.md`,
  `docs/WEBSITE.md`, `docs/LICENSE_KEYS.md`, `docs/REPORTING.md` (dashboard
  metrics and accounting statement formulas) and `docs/FINANCE.md` (expenses
  module, edit endpoint and tests).

## 1.1.0 — Batch 14: staff, permissions, finance and richer reports

- **Staff & Permissions** page: add, edit, deactivate and reactivate staff,
  reset passwords (which revokes their sessions), and toggle the permissions
  of the Administrator, Manager and Cashier roles. The Administrator role
  always keeps staff and settings management; guards prevent deactivating
  yourself, changing your own role or removing the last account that can
  manage staff.
- **Finance** page: record expenses by category with date, note and location,
  and read a profit statement for any range — gross sales, COGS, gross profit
  with margin, expenses, net profit and cash received by payment method.
  Export the statement, category breakdown and expense list to CSV.
- **Reports** gained four blocks and tabs: **Products** (quantity sold,
  revenue, profit, on-hand stock and stock value for every product),
  **Weekly** (Monday-based weeks with expenses and net profit, expense-only
  weeks included) and **Stock alerts** (products at or below reorder level,
  with shortfall, suggested order and value at cost).
- **Help & Support** page: quick-start checklist, scanner and Xprinter notes,
  licence/support contacts and one-click diagnostics (version, business
  profile, licence state, printers, backups) with copy-to-clipboard.
- LAN parity: `GET/POST/PATCH /api/staff`, `/api/staff/roles`,
  `/api/staff/:id/password` and `/api/finance/expenses`; new `finance.manage`
  permission (admin and manager only). Migration `0012_finance_staff.sql`.
- New buyer setup sheet `docs/BUYER_SETUP.md` covering the unsigned-installer
  SmartScreen "More info → Run anyway" steps.
- **Sales website**: redesigned dark landing page (hero dashboard, feature row,
  pharmacy/boutique illustration, dashboard panels, hardware, packages, demo
  request), hosted installation and daily-use guides at `/docs`, a `/download`
  page, WhatsApp support buttons (`+234 812 431 4217`) and installer download on
  the payment confirmation page next to the licence key. Installer URL and
  WhatsApp number are configurable through `NEXT_PUBLIC_DOWNLOAD_URL` and
  `NEXT_PUBLIC_WHATSAPP`; Vercel deployment steps are in `docs/WEBSITE.md`.
- Docs: `docs/STAFF.md`, `docs/FINANCE.md`, `docs/WEBSITE.md`, updated
  `docs/REPORTING.md` and `docs/CHECKOUT.md`.

## 1.0.0 — Commercial release

- Version 1.0.0; the installer is now `AnalytIQ-Inventory-Setup-1.0.0.exe`.
- Production Ed25519 licence keypair generated: the public key is embedded in
  the app, the private key stays in `.secrets/` (git-ignored) and is configured
  on the cloud API via `LICENSE_PRIVATE_KEY` / `LICENSE_PRIVATE_KEY_PATH`.
- Code-signing path for the installer: `pnpm dist:signed` from
  `apps/desktop` refuses to build unless `CSC_LINK` (and `CSC_KEY_PASSWORD`)
  are set, so a release cannot ship unsigned by accident.
- Release checklist added: `docs/RELEASE_CHECKLIST.md`.

## 0.14.0 — Batch 13: bulk import, thermal printing and barcode scanning

- **Import CSV** for products, purchases and historical sales (Products,
  Purchases, Sell → Sales history). Downloadable templates, naira→kobo
  conversion, row-level errors, 5,000 rows per file. Products/purchases are
  validated as a whole and written in one transaction; sales are grouped by
  receipt, written per sale, and refuse already-imported receipts via the new
  `sales.external_ref` idempotency key. Categories, suppliers and customers are
  created on demand; sales can be backdated (`soldAt`).
- **Thermal receipt printing**: silent printing to Xprinter 58/76/80 mm (or any
  Windows driver) from a hidden window, with a system-dialog fallback. Settings
  for printer, roll width, copies and auto-print, plus a test print. Works on
  LAN-client tills with their own printer.
- **Barcode scanners**: keyboard-wedge scanning on the Sell screen with exact
  barcode/SKU lookup, beep feedback and scan-into-search; new
  `GET /api/products/by-barcode` and `productByBarcode` IPC.
- New LAN routes `GET /api/business` and `POST /api/import/{products,purchases,sales}`.
- Docs: `docs/IMPORT.md`, `docs/PRINTERS.md`.

## 0.13.0 — Batch 12: backups, branding, updates and release hardening

- Verified local backups: `VACUUM INTO` snapshots are checked with
  `PRAGMA integrity_check` and a required-table probe before being offered, and
  can be restored from **Settings → Backups**. Daily automatic snapshots.
- Business branding/profile settings, update checks against an HTTPS manifest
  (`ANALYTIQ_UPDATE_URL`), and hardened Electron defaults (sandbox, context
  isolation, allow-listed IPC, no secrets in the package).
- NSIS installer ships the unpacked SQLite native module and all migrations.
- Docs: `docs/BACKUPS.md`, `docs/UPDATES.md`, `docs/SECURITY.md`.

## 0.12.0 — Batch 11: WhatsApp and AI automation

- Low-stock and end-of-day WhatsApp alerts with a persisted outbox
  (`queued`, `sent`, `failed`, `dry_run`), once-a-day guards and a 15-minute
  scheduler in the desktop app and LAN server.
- WhatsApp Cloud API delivery, Meta template + language support for messages
  outside the 24-hour window, and optional AI rewrite through any
  OpenAI-compatible endpoint.
- Secrets live only in the local database, are never echoed to the renderer,
  and are excluded from sync/audit payloads.
- Settings card for triggers, credentials, test messages and recent outbox.
- Docs: `docs/AUTOMATION.md`.

## 0.11.0 — Batch 10: licensing, online checkout and the sales website

- Offline Ed25519 licence keys (`ANQ1.<payload>.<signature>`) with a 14-day
  trial, install-id locking, activation/deactivation and vendor CLI tooling.
- Cloud API (NestJS): `/api/plans`, `/api/checkout`, order status, and a
  signature-verified Paystack webhook that issues the key exactly once
  (idempotent settlement, amount/currency checks).
- Shared plan catalogue in `@analytiq/validation` so the website price and the
  charged amount cannot drift.
- Sales website (Next.js): landing page with pricing, checkout form, and a
  confirmation page that polls the order and shows a copyable key.
- Docs: `docs/LICENSE_KEYS.md`, `docs/CHECKOUT.md`.

## 0.10.0 — Batch 9: reporting

- Live reports computed from the ledger (no stored aggregates): sales totals,
  payment mix, top products, stock value and low-stock, customer credit and
  supplier balances.
- Reports page in the desktop app and `GET /api/reports/summary` on the LAN
  server, both behind `reports.view`.
- Docs: `docs/REPORTING.md`.

## 0.9.0 — Batch 8: multi-location and branch sync

- Locations management with per-location stock and scoping on sales and
  purchases.
- Opt-in relay sync between branches: shared entities push/pull, append-only
  stock ledger, per-device cursors, no customer account required.
- Desktop sync settings/status and LAN sync endpoints.
- Docs: `docs/SYNC.md`.

## 0.8.0 — Batch 7: LAN server and multi-computer

- New LAN mode: the primary computer owns SQLite and runs the Fastify server;
  other computers run the desktop app in client mode, where every IPC channel
  is proxied to HTTP and SQLite is never opened. Mode is selected with
  `ANALYTIQ_SERVER_URL` or a `server.json` beside the executable/userData.
- REST surface mirroring IPC: setup and session (`/api/status`, `/api/setup`,
  `/api/auth/*`), products and categories, stock levels/movements/adjust/count,
  sales and refunds/voids, tax categories, tables, customers and credit
  payments, suppliers, and purchasing. Same `{ ok, … }` envelopes and coded
  errors; bearer sessions with server-side permission checks.
- Socket.IO realtime scoped per business: `inventory.changed`, `sale.created`,
  `sale.updated`, `customer.updated`, `table.updated`. Desktop clients
  subscribe automatically (token in the handshake) and refetch mounted queries,
  so a sale on one register updates the next.
- Client sessions persist through Electron `safeStorage`; logout removes them.
  Optional TLS via `ANALYTIQ_TLS_CERT`/`ANALYTIQ_TLS_KEY`.
- Server build is CJS (`dist/index.js`) and links `@analytiq/database`; the
  database and LAN suites run under Electron's Node ABI.
- Tests: `server.test.ts` (8 tests) — setup/status idempotency, login/me/logout,
  bad credentials, unauthenticated reads, product/stock/sale flow, credit
  tender accounting, permission denial (cashier), coded 404s, health probe.
  Docs: `docs/LAN_SETUP.md`.
- Packaging: main/preload are bundled with esbuild (electron-builder dropped
  transitive deps under pnpm's strict layout), `better-sqlite3` is unpacked
  from the asar, and the Windows NSIS installer builds and boots with the
  packaged SQLite and migrations.

## 0.7.0 — Batch 6: customers, suppliers, purchasing

- Customers with credit limits and a derived balance: a sale marked _Credit
  (pay later)_ puts the bill on the customer's account, the limit is checked
  before the sale is written, and part-cash/part-credit works by splitting the
  tender. Payments recorded against the account reduce the balance; a customer
  who still owes cannot be archived.
- Suppliers contact book, and a purchase ledger: purchases are recorded as
  drafts, and _Receive_ is the only thing that moves stock — one movement per
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
