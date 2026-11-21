# Project Status

## Batch 1 — Foundation and Architecture: DONE (scaffold, unverified builds)

Scaffolded: pnpm workspaces + Turborepo, strict TS base, ESLint/Prettier,
Vite + React + Tailwind desktop shell, Electron main/preload/renderer with
secure IPC defaults, Fastify stub, NestJS stub, Next.js stub, 7 shared
packages, Vitest + Playwright configs, `.env.example` templates, 6 docs.

Not yet run (environment blocked shell execution): `pnpm install`, `build`,
`typecheck`, `lint`, `test`. Run these before considering Batch 1 verified.

## Batch 2 — Desktop Foundation and User Interface: DONE (scaffold, unverified builds)

App shell, 12-section routing, theme/notification stores, UI kit, secure IPC,
NSIS packaging config, component tests. Verification pending (blocked shell).

## Batch 3 — Database, Authentication, Business Setup: DONE (scaffold, unverified builds)

Implemented:

- SQLite schema (`packages/database/src/schema.ts`): businesses, locations,
  users, roles, permissions, role_permissions, user_roles, devices, sessions,
  audit_logs, app_settings (+ schema_meta). UUID text PKs, business/location
  scoping, timestamps, version columns, unique (business_id, email).
- SQL migration chain (`drizzle/0001_batch3_auth_setup.sql`) + dependency-free
  runner (`migrate.ts`, `__migrations` table); `ANALYTIQ_DB_PATH` override,
  WAL + foreign-key enforcement.
- Service layer: atomic `runSetup` (business, location, 12 permissions,
  Admin/Manager/Cashier roles, admin user, settings, audit), `login` with
  5-strike/15-min lockout, token sessions (12 h TTL, SHA-256 hash stored),
  `logout`, `authenticate`, permission helpers.
- Desktop: main-process DB ownership, 7-channel allow-listed IPC, typed
  renderer client, `useSession` + `RequireAuth` + `RequirePermission`,
  3-step setup wizard, login page, permission-filtered nav, real account menu.
- Tests: DB lifecycle (setup/login/session/lockout), validation schemas,
  session store. New dep: `@hookform/resolvers`.
- Docs: `docs/AUTH.md`; updated status/changelog/known-issues.

Not yet run (environment blocked shell execution): `bash
scripts/verify-batch-3.sh` — install, typecheck, lint, tests for
validation/database/desktop.

## Batch 4 — Products and Inventory: DONE (scaffold, unverified builds)

Implemented:

- Schema: `categories`, `products`, `stock_movements` with indexes; migration
  `0002_batch4_products_inventory.sql` + journal entry.
- Service (`inventory.ts`): categories, product CRUD with unique SKU/barcode
  checks, archive/restore, per-location levels, adjust/count with
  negative-stock guard, movement history — all transactional with audit.
- Desktop IPC: 12 `inventory:*` channels, session-gated, permission-checked.
- UI: ProductsPage (search/filter/paginate/create/edit/archive), detail page,
  InventoryPage (levels, adjust/count, movements), kobo money helpers.
- Tests: `inventory.test.ts` (service), `inventory.test.ts` (validation),
  `money.test.ts`. Docs: `docs/PRODUCTS_INVENTORY.md`.

Not yet run (environment blocked shell execution): `bash
scripts/verify-batch-4.sh` — install, typecheck, lint, tests for
validation/database/desktop.

## Batch 5 — POS and Cash Register: DONE (scaffold, unverified builds)

Implemented:

- Schema: `sales`, `sale_items`, `sale_payments`, `sale_reversals` with
  indexes; migration `0003_batch5_pos_sales.sql` + journal entry.
- Service (`sales.ts`): atomic `createSale` (cart validation, line +
  header discounts, business-rate tax default, split tender over
  cash/transfer/pos/credit, credit-must-match, stock guard per line),
  `refundSale`/`voidSale` (restock via `return` rows + reversal record,
  double-reversal guard), `getSale`/`listSales`.
- Desktop IPC: 5 `sales:*` channels, session-gated, permission-checked.
- UI: PosPage (product search, cart, tender dialog, receipt view with
  print popup for thermal + standard printers, sales history with
  refund/void), wired to `/pos` route.
- Tests: `sales.test.ts` (service), `sales.test.ts` (validation).
  Docs: `docs/POS.md`.

Not yet run (environment blocked shell execution): install, typecheck,
lint, tests for validation/database/desktop.

## Restaurant Pack (Batch 5 extension): Tables, Product Images, Tax Categories, Barcode

Implemented:

- Schema: `tax_categories` (named rates in basis points, one default per
  business), `dining_tables` (name, seats, note, `free`/`occupied` status),
  `products.image_path`, `products.tax_category_id`, `sales.table_id`; migration
  `0005_restaurant_pack.sql` + journal entry.
- Service: `taxCategories.ts` (list/create/update, `ensureDefaultTaxCategory`),
  `tables.ts` (CRUD, `setTableStatus`, delete guarded by `TABLE_OCCUPIED` and
  `TABLE_HAS_SALES`), `sales.ts` per-line tax (category rate with business-rate
  fallback, header discount spread proportionally, explicit override supported)
  and table handling (validated, occupied inside the transaction, released after
  commit; `TABLE_NOT_FOUND`/`TABLES_WRONG_LOCATION`/`TABLE_OCCUPIED` guards).
- Validation: `taxCategorySchema`, `taxCategoryUpdateSchema`, `tableSchema`,
  `tableUpdateSchema`, `tableStatusSchema`, `tablesQuerySchema`, `TABLE_STATUSES`;
  `imagePath`/`taxCategoryId` on products, `tableId` on sale create.
- Desktop IPC: 9 new channels (`inventory:tax-categories`, create/update;
  `tables:list/create/update/set-status/delete`), session-gated and
  permission-checked, typed through preload into the renderer client.
- UI: Products — photo upload (downscaled to a 640 px JPEG data URL and stored
  inline in `image_path`, so images work fully offline and ride in the single
  SQLite backup), tax-category dropdown, EAN-13 barcode generator, thumbnails in
  the list and detail pages, tax column. POS — table selector bar (Takeaway plus
  free/occupied table chips), per-line tax estimate from real categories, table
  shown in the cart, receipt and sales history. New **Tables** page (floor grid,
  add/rename/delete, mark busy/free, start order → `/pos?table=<id>`) and
  **Tax Categories** page under Setup.
- Tests: `restaurant.test.ts` — tax-category CRUD, per-category tax math, product
  image/tax fields, table lifecycle and sale tagging.

## Batch 6 — Customers, Suppliers, Purchasing: DONE

Implemented:

- Schema: `customers`, `suppliers`, `purchases`, `purchase_items`,
  `customer_payments`, plus `sales.customer_id`; migration
  `0006_batch6_contacts_purchasing.sql` with business/name, phone, supplier and
  created-at indexes, and `0007_backfill_batch6_permissions.sql` which grants
  the three new permissions to existing Administrator and Manager roles.
- Service: `customers.ts` (list/get/create/update/archive, derived balance
  counting credit tenders only, `recordCustomerPayment`, `listCustomerPayments`),
  `suppliers.ts` (list/create/
  update/archive with purchase counts), `purchases.ts` (create draft, receive
  into stock in one transaction, cancel, list with lines), and credit handling
  in `sales.ts` (`CREDIT_REQUIRES_CUSTOMER`, `CREDIT_LIMIT_EXCEEDED`,
  `CREDIT_MUST_MATCH`, `CUSTOMER_HAS_BALANCE`).
- Validation: `customerSchema`, `customerUpdateSchema`, `customersQuerySchema`,
  `supplierSchema`, `supplierUpdateSchema`, `suppliersQuerySchema`,
  `purchaseCreateSchema`, `purchaseItemSchema`, `purchasesQuerySchema`,
  `customerPaymentSchema`, `PURCHASE_STATUSES`; optional email/phone refiners;
  `customerId` on sale create.
- Desktop IPC: 16 channels (`customers:*`, `suppliers:*`, `purchases:*`),
  session-gated and permission-checked, typed through preload into the renderer.
- UI: new **Customers** (search, credit limit, live balance, record payment,
  payment history, archive/restore), **Suppliers** and **Purchases** (filters,
  expandable lines, multi-line item editor, receive/cancel) pages, routed behind
  their modules; POS gains a customer selector that unlocks the credit tender and
  a "put remaining on credit" shortcut; sale view models now carry
  `customerId`/`customerName`.
- Tests: `batch6.test.ts` (13 tests) — customer CRUD/validation, archive with
  balance refused, credit sale balance, credit without customer, credit limit,
  change owing, payment settlement, supplier CRUD, purchase lifecycle. The
  Batch 5 credit test now creates a customer, matching the new rule.
- Docs: `docs/CUSTOMERS_PURCHASING.md`.

Verified locally: `pnpm --filter @analytiq/database typecheck`,
`pnpm --filter @analytiq/desktop typecheck`, `pnpm --filter @analytiq/desktop
lint`, `pnpm --filter @analytiq/desktop test` (20 tests), and the database suite
(41 tests) run under Electron's Node because `better-sqlite3` is built for
Electron's ABI.

## Batch 7 — LAN Server and Multi-Computer: DONE

Implemented:

- `apps/local-server/src/server.ts`: Fastify app with OpenAPI at `/docs`,
  `/health`, and the REST surface mirroring the desktop IPC — `status`,
  `setup`, `auth/login|logout|me`, products and categories, stock
  levels/movements/adjust/count, sales + refund/void, tax categories, tables,
  customers + payments, suppliers, and purchasing. Same `{ ok, … }` envelopes,
  coded errors mapped to HTTP statuses, bearer-session auth on every domain
  route, permission checks inside the shared service layer.
- Socket.IO on the same port: handshake authenticated with the bearer token,
  sockets joined to a per-business room, events `inventory.changed`,
  `sale.created`, `sale.updated`, `customer.updated`, `table.updated`.
  Optional HTTPS through `ANALYTIQ_TLS_CERT`/`ANALYTIQ_TLS_KEY`.
- Desktop LAN client (`apps/desktop/electron/lanClient.ts`): mode selected by
  `ANALYTIQ_SERVER_URL` or `server.json` (exe folder or userData). Every IPC
  channel is proxied to REST; SQLite is never opened. Login tokens live in
  main-process memory and persist through `safeStorage`; logout clears them.
  The main process keeps a Socket.IO client and forwards events to the renderer,
  where `useRealtime` invalidates mounted queries.
- Build/tooling: local-server is CJS (`dist/index.js`), depends on
  `@analytiq/database`, and ships `@types/node`; the database package was
  rebuilt so the server runs against current services.
- Tests: `apps/local-server/src/server.test.ts` (8 tests) — setup/status
  idempotency, login/me/logout, bad credentials, unauthenticated reads,
  product/stock/sale flow, credit-tender-only balances, cashier permission
  denial, coded 404, health probe. Run under Electron's Node ABI.
- Docs: `docs/LAN_SETUP.md` (primary setup, firewall, client config, TLS,
  route table, realtime events, operating rules); README/roadmap updated.

Verified locally: `pnpm --filter @analytiq/local-server typecheck` and build,
`pnpm --filter @analytiq/desktop typecheck`, plus the suites listed above.

Packaging: the Electron main/preload are esbuild-bundled (pnpm's strict layout
made electron-builder drop transitive deps), `better-sqlite3` is unpacked from
the asar, and `apps/desktop/release/AnalytIQ-Inventory-Setup-0.1.0.exe` was
built and smoke-tested — packaged SQLite loads, all 7 migrations apply, and the
installed app starts and creates its database.

## Batch 8 — Cloud Sync and Multi-Location: DONE

Implemented:

- Locations management (create/update, promote branch), per-location stock
  levels and scoping on sales/purchases, and a default-location fallback.
- `packages/sync-engine`: relay-based branch sync — push changed shared
  entities, pull unseen ones, append-only stock ledger, per-device cursors.
  Sync is opt-in per installation and needs no customer account.
- Local-server sync endpoints and desktop sync settings/status UI; audit trail
  for sync runs.
- Tests: sync-engine unit tests, sync endpoints in the server suite.
- Docs: `docs/SYNC.md`.

## Batch 9 — Reporting and Analytics: DONE

Implemented:

- `getReportsSummary()` in `packages/database/src/reports.ts` — sales totals,
  payment mix, top products, stock value/low-stock, credit outstanding and
  supplier balances, computed live from the ledger.
- Desktop Reports page, LAN route `GET /api/reports/summary`, and the same
  permission (`reports.view`) on every path.
- Tests: reporting assertions inside the database suite.
- Docs: `docs/REPORTING.md`.

## Batch 10a — Offline Licensing and Trial: DONE

Implemented:

- `packages/licensing`: Ed25519 `ANQ1.<payload>.<signature>` keys, embedded
  public key, trial start on first check (14 days), activation/deactivation,
  install-id device locking, `schema_meta` storage.
- Vendor tooling: `keygen.mjs` and `issue.mjs`; the private key never enters the
  repository or the installer.
- Desktop settings licence card and gating of business screens after trial
  expiry (status/auth endpoints stay reachable).
- Docs: `docs/LICENSE_KEYS.md`.

## Batch 10b — Cloud Licensing API and Website Checkout: DONE

Implemented:

- `apps/cloud-api` (NestJS): `GET /api/plans`, `POST /api/checkout`,
  `GET /api/checkout/:reference`, signed Paystack webhook, Swagger at `/docs`.
- Shared plan catalogue and `checkoutSchema` in `packages/validation`, so the
  displayed price and the charged amount come from one source.
- `FileOrderStore` (atomic, serialised writes; `OrderStore` seam for a later
  database), idempotent settlement with amount/currency checks, licence
  issuance through the pure `@analytiq/licensing/dist/key` module.
- `apps/website` (Next.js): landing page with pricing, `/checkout` form,
  `/checkout/success` poller that shows and copies the key, shared API client
  with coded error mapping.
- Tests: cloud-api 22 (service, Paystack client, webhook, checkout controller),
  website 10 (formatter + API client).
- Docs: `docs/CHECKOUT.md`.

## Batch 11 — AI and WhatsApp Automation: DONE

Implemented:

- `automation_settings`/`automation_messages` outbox; low-stock and daily-summary
  message generation, once-a-day guards, per-business opt-in.
- WhatsApp Cloud API delivery with dry-run mode, Meta template support and
  language, and optional AI rewrite through an OpenAI-compatible endpoint.
- Server routes (`/api/automation/*`), 15-minute scheduler in the desktop app
  and LAN server, realtime `automation.changed` events, Settings UI.
- Secrets are stored only in the local database, redacted in views, and never
  echoed back to the renderer.
- Tests: 10 automation tests; server route test.
- Docs: `docs/AUTOMATION.md`.

## Batch 12 — Security, Backups and Release: DONE

Implemented:

- Verified local backups (`VACUUM INTO` + integrity and table checks), restore
  from the Backups card, automatic daily snapshots.
- Branding/business profile, update-check plumbing, hardened Electron defaults
  (`contextIsolation`, `sandbox`, allow-listed IPC), secret-handling rules.
- NSIS installer with unpacked SQLite native module and bundled migrations.
- Docs: `docs/BACKUPS.md`, `docs/UPDATES.md`, `docs/SECURITY.md`.

## Batch 13 — Bulk import, printers and scanners: DONE

Implemented:

- CSV import for products, purchases and historical sales, with downloadable
  templates, row-level validation and all-or-nothing writes (sales imports are
  per-sale atomic and idempotent through `external_ref`).
- Auto-created categories, suppliers and customers; opening stock, received
  purchases and backdated sales (`soldAt`).
- Silent thermal receipt printing for Xprinter 58/76/80 mm (or any Windows
  driver) from a hidden window, with a system-dialog fallback; per-user printer,
  width, copies and auto-print settings; test print.
- Keyboard-wedge barcode scanning on the Sell screen with exact barcode/SKU
  lookup, beep feedback and scan-into-search support.
- LAN parity for barcode lookup, business profile and all three import routes.
- Docs: `docs/IMPORT.md`, `docs/PRINTERS.md`.

## Batch 14 — Staff, permissions, finance and richer reports: DONE

Implemented:

- Staff & Permissions page backed by `packages/database/src/staff.ts`: add,
  edit, deactivate/reactivate staff, password reset with session revocation,
  and editable permissions for the three built-in roles. Guards: last
  staff-manager, self-deactivation, own-role change, Administrator keeps
  `staff.manage` + `settings.manage`.
- Finance page backed by `packages/database/src/finance.ts` and a new
  `expenses` table (migration `0012_finance_staff.sql`): expenses by category,
  profit statement (net = tax − COGS − expenses), cash received by method,
  CSV export.
- Reports service now also returns `expenses`, `finance`, `weekly`
  (Monday-based, expense-only weeks included), `products` (per-product sold,
  revenue, profit, on-hand, stock value) and `stockAlerts` (shortfall and
  suggested order). Reports page gained Overview/Products/Weekly/Stock alerts
  tabs.
- Help & Support page: quick start, hardware notes, licence/support card and
  one-click diagnostics (version, profile, licence, printers, backups).
- LAN parity: staff, role-permission and expense routes on the local server;
  new `finance.manage` permission granted to admin and manager.
- Website: new dark landing page, `/docs` installation and usage guides,
  `/download` page, WhatsApp support (`+234 812 431 4217`) and installer download
  on the payment confirmation page. Installer URL is set with
  `NEXT_PUBLIC_DOWNLOAD_URL`; Vercel steps are in `docs/WEBSITE.md`.
- Docs: `docs/STAFF.md`, `docs/FINANCE.md`, `docs/BUYER_SETUP.md`,
  `docs/WEBSITE.md`, updated `docs/REPORTING.md`, `docs/CHECKOUT.md`,
  `README.md` and `CHANGELOG.md`.

Version bumped to `1.1.0`; installer is now
`apps/desktop/release/AnalytIQ-Inventory-Setup-1.1.0.exe` (unsigned until the
certificate is bought).

Verification: database 92/92 (8 new), local-server 20/20 (1 new), desktop
renderer 39/39, validation 20/20, licensing 7/7, cloud-api 25/25, website
10/10, `pnpm lint` clean, `pnpm typecheck` 15/15.

## Batch 15 — Business pack: modules, batches, tiers, loyalty, returns, transfers, debtors, offsite backup: DONE

Implemented:

- Business-type presets and module installs (`packages/database/src/modules.ts`,
  migration `0013_business_pack.sql`): nine optional modules on top of the core
  set, resolved per business type and stored as overrides in `app_settings`.
  Setup gained Bar/Lounge, Electronics and Boutique types; Settings → **Install
  Modules** toggles any module and the session's module list drives the menu,
  route guards and POS features immediately.
- Batches & expiry (`batches.ts`): batch intake, per-batch remaining stock,
  status badges (OK/expiring/expired/empty), expiry alerts by window, and
  First-Expired-First-Out allocation on sales. Products opt in with
  `trackBatches` + `nearExpiryDays`; purchases accept batch number and expiry
  per line. Returns restock the exact consumed batches (prefix match on the
  sale reason, including batched sales).
- Wholesale price tiers (`priceTiers.ts`): tiers with per-product overrides
  and optional default tier, customer assignment, tier price applied on the
  Sell screen when the cashier has not typed a price.
- Loyalty and simple CRM (`loyalty.ts`): points ledger (earn per spend, redeem
  as a discount clamped to balance and order value, manual adjust), settings
  card, receipts show discount and points earned, customer profile with visit
  summary and notes.
- Counter returns/exchanges (`returns.ts`): receipt lookup, per-line
  returnable qty, refund cap, restock, full-return status flip, return history
  with search — plus a fix so batched sales restock to their original batches.
- Branch stock transfers (`transfers.ts`): paired `transfer_out`/`transfer_in`
  ledger rows, batch identity preserved, same-location and negative-stock
  guards, `TRF-000001` references and history.
- Debtor reminders (`debtors.ts`): outstanding balances per customer, opt-in
  selection, dry-run preview when WhatsApp is unconfigured, per-reminder log
  and last-reminder column.
- Encrypted offsite backup (`cloudBackup.ts`): AES-256-GCM with scrypt key
  derivation into `.aqb`, PUT upload with bearer key and `x-analytiq-file`,
  settings card and recent-upload list. Passphrase never leaves the machine.
- UI: Batches & Expiry, Returns, Transfers, Price Lists, Debtors, Install
  Modules pages; loyalty and cloud-backup cards in Settings; product batch
  toggle; POS tier pricing and point redemption.
- IPC + LAN parity for every route; renderer LAN client updated.
- Tests: `batch15.test.ts` 10 tests (DB), 3 new local-server REST tests, nav
  module-visibility tests (10 total).
- Fixed crash `H.find is not a function` on Products/Sell after visiting
  Settings → Tax categories: the shared `['tax-categories']` cache held two
  different shapes. All three screens now use one helper
  (`src/lib/taxCategories.ts`, 2 tests) that always returns `TaxCategory[]`.
- Docs: `docs/BUSINESS_PACK.md`.

Verification: database 102/102, local-server 23/23, desktop 44/44, validation
20/20, licensing 7/7, business-logic 2/2, cloud-api 25/25, `pnpm -r lint`
clean, `pnpm -r typecheck` clean, renderer + Electron bundle build clean.
Installer re-packed (`release/AnalytIQ-Inventory-Setup-1.1.0.exe`) after
pre-seeding the `winCodeSign` cache without the darwin symlinks, which avoids
the 7-Zip symlink-privilege failure on a non-admin shell.

## Website pricing refresh: DONE

- One public package: `licensePlans` now holds a single `standard` plan at
  ₦80,000 per year for one shop location; the website, checkout form and
  cloud-api all read that catalogue. Extra tills on the same shop network stay
  included. More than one location is the cloud version, quoted per setup.
- Landing page rebuilt on the mockup's structure: light emerald/cream palette
  (trust, growth, warmth), announcement bar, warehouse / supermarket / POS
  computer imagery, a "three places your stock lives" section, a single-package
  pricing block, a cloud quote card and an embedded quote form.
- Quote form (`components/QuoteRequest.tsx`, `lib/quote.ts`) asks for business,
  contact, locations, tills and notes, then opens WhatsApp with the details
  prefilled. `lib/quote.test.ts` covers message building.
- Landing copy distinguishes the offline app from the cloud version and the
  FAQ explains why a second location is quoted.
- Docs updated: `docs/CHECKOUT.md`, `docs/WEBSITE.md`, `docs/LICENSE_KEYS.md`.

Verification: website 25/25, validation 20/20, cloud-api 25/25; typecheck and
lint clean for website, cloud-api and validation; `next build` produced 13
static routes; page snapshot shows every section, the three images and the
quote form with no console errors. Screenshot capture was blocked because the
in-app browser window was not visible.

## Dashboard analytics and accounting: DONE

- Dashboard rebuilt around `getReportsSummary()` with two live queries (today,
  month to date): today's sales, basket and cash/transfer received; month
  gross profit, net profit, margins, expenses and average basket; credit, low
  stock and stock value; seven-day trend; payment mix; best-selling products
  with per-product margin; sales by cashier; and a profit snapshot that links
  to Accounting. Staff without `reports.view` get the original sales-list
  tiles and restock card instead, so cashiers are unaffected.
- Accounting page at `/accounting` (nav under Manage, `reports.view`) with
  Overview, Profit & loss and Product sales tabs, presets including last month
  and a custom range, and CSV export.
- Statement renderers in `apps/desktop/src/lib/statements.ts`: P&L derives
  loyalty as the remainder of the subtotal (net sales = subtotal − discounts −
  loyalty), shows tax as collected rather than income, and closes to net
  profit; product sales lists sold products ranked by revenue with COGS,
  profit, margin and share, plus a balancing totals row and unsold count.
- Tests: `statements.test.ts` 7 tests, `AccountingPage.test.tsx` 3 render
  tests (overview, P&L, product statement) and a nav gating test for
  `/accounting` (desktop 55/55).
- Docs: `docs/REPORTING.md` gained dashboard and statement sections;
  `CHANGELOG.md` updated.
- Landing page: the "screens" section now opens with three real app captures
  (Reports plus both sign-in screens) above the illustrated panels.

Verification: desktop 55/55, `pnpm --filter @analytiq/desktop typecheck` clean,
`pnpm --filter @analytiq/desktop lint` clean, renderer build clean. Website
25/25, typecheck/lint/`next build` clean; the three optimized images return 200
in the production preview. Installer not re-packed in this change.

## Expenses module: DONE

- New optional `expenses` module in `OPTIONAL_MODULES`, installed by default
  for all ten business types and switchable in Settings → Install modules.
- Expenses page at `/expenses` (Manage, `finance.manage` + module guard):
  this month / last month / this year / custom range, category filter, note
  search, selection totals (total spent, entries, average per entry, biggest
  category), ledger with recorded-by, add/edit/delete and filtered CSV export.
- Expense editing end to end: `updateExpense()` service with
  `expense.update` audit, IPC `finance:update-expense`, LAN
  `PATCH /api/finance/expenses/:id`, preload/global/ipc fallback, and the
  `expenseUpdateSchema` validator.
- Finance page keeps the profit statement and the statement CSV; the
  expenses-by-category block still feeds both screens.
- Tests: validation 21/21 (expenses default + switch-off), database 103/103
  (edit, permission refusal, not-found), desktop 61/61 (5 ExpensesPage render
  tests + nav gating), LAN 23/23 (PATCH + totals). Desktop typecheck, lint,
  renderer build and electron bundle clean. Installer not re-packed.

## Batch 16 — Shop masters, stock adjustments, purchase returns, labels and report menu: DONE

Implemented:

- Master data (`masters.ts`): shared list/create/update for brands, units,
  warranties (duration in days) and customer groups, exposed as
  `masters:list/create/update` (IPC) and `GET/POST /api/masters/:kind`,
  `PATCH /api/masters/:kind/:id` (LAN). Products gain `brandId` and
  `warrantyId`; customers gain `groupId`.
- Stock adjustments (`stockAdjustments.ts`): `ADJ-000001` references, per-line
  signed quantity, stock-below-zero guard, `stock_adjustment` movement kind,
  audit entry and a list screen with the new `/stock-adjustments` route.
- Purchase returns (`purchaseReturns.ts`): returns for received purchases only,
  per-product quantities capped by the unreturned part of the purchase,
  weighted unit-cost total, `PRT-000001` references and a `purchase_return`
  stock movement; `/purchase-returns` screen behind the `purchases` module.
- Menu reports (`menuReports.ts`, `getMenuReports`): purchase-and-sale daily
  ledger, output/input/net tax, customer and supplier balances with
  receivables/payables, customer groups, stock adjustments, product purchases,
  purchase payments (total, paid, returns, balance), sell payments, registers
  and sales representatives, in one response for the chosen range.
- Print labels (`/labels`): EAN-13 checksum, validation and 95-module encoder
  (`lib/ean13.ts`) rendered as inline SVG inside 50×30 mm print labels; per-row
  copies, select-all, "only with barcode" filter and hidden-iframe printing.
- CSV imports: `opening-stock` (absolute per-branch quantity matched by
  barcode/SKU/name with an `opening` movement; re-import is idempotent) and
  `contacts` (customers and suppliers with type, contact fields and an existing
  group), both with templates, IPC, LAN routes and Import Dialog entries.
  Fixed the opening-stock transaction, which was created but never invoked.
- Sidebar: grouped collapsible navigation (Main, Sell, Products, Inventory,
  Purchases, Contacts, Reports, Finance, Setup) with persisted collapse state,
  permission and module gating per item.
- Users & Roles screen splits the staff table and role permissions into tabs.
- Tests: `batch16.test.ts` (4 DB tests: masters CRUD, adjustments guard,
  purchase return caps, menu report totals), 4 new opening-stock/contact import
  tests in `imports.test.ts`, 4 new import-csv tests, 4 EAN-13 tests, 13 new
  desktop render tests (`MenuReportsPanel` 7, print labels 6), 5 new nav gating
  tests, and one new local-server REST test covering every Batch 16 route.
- Docs: `docs/SHOP_MASTERS.md`, plus `docs/IMPORT.md` and `docs/REPORTING.md`
  updated for the new kinds and the report menu.

Verification: validation 21/21, database 111/111, desktop 84/84, local-server
24/24 (typecheck and lint clean; renderer build checked). Installer not
re-packed for this batch.

## Batch 17 — Cash & bank ledgers and restaurant service flow: DONE

Implemented:

- Cash & bank accounts (`accounts.ts`, migration `0015_restaurant_accounts.sql`):
  `accounts`, `account_transactions` and `payment_account_map` tables. Balance
  is the opening balance plus the signed sum of movements, never a counter.
  Create/update/archive accounts (`cash`, `bank`, `pos`, `mobile`), move money
  between accounts (paired out/in entries, overdraw refused), signed
  adjustments with a reason, and a filterable ledger with in/out totals.
- Automatic posting: every completed sale posts its tenders inside the sale
  transaction (cash net of change, credit posts nothing), returns post
  negative entries, voids post one idempotent reversing entry, expenses and
  customer payments post too. Tender → account resolution: explicit payment
  map, then account kind, then any active account, then a lazily created
  "Cash" account.
- Payment mapping screen pins cash/transfer/POS tenders to specific accounts.
- Cash & Bank page (`/accounts`, `accounts` module, Finance group,
  `finance.manage`): account cards with balances and default/archived badges,
  ledger, move-money and adjust modals, payment mapping card.
- Expenses gain a "Paid from" account (blank = automatic by tender type) and
  list the resolved account name.
- Restaurant service flow: when the Tables module is installed the POS shows
  order type (Dine-in / Takeaway / Delivery), waiter name, service charge %
  (pre-filled from Settings → Restaurant, editable per sale, computed on the
  net bill) and a tip. Service charge and tip are added after tax, stored on
  the sale (`service_charge_kobo`, `tip_kobo`), appear on the receipt and sale
  detail, and count toward the tendered amount.
- Kitchen order tickets: optional per-sale ticket with receipt number, time,
  order type, table, waiter and quantity × item (no prices), printed to the
  receipt printer or a separate kitchen printer, with the system print dialog
  as fallback.
- LAN REST parity: `/accounts`, `/accounts/transactions`,
  `/accounts/payment-map`, `/accounts/transfer`, `/accounts/adjust`,
  `PATCH /accounts/:id` and `/restaurant/settings`.
- Tests: 1 new local-server REST test covering the account and restaurant
  routes; 2 new receipt tests (restaurant bill lines, kitchen ticket); 3 new
  Cash & Bank render tests; database suite 119/119; validation 21/21; desktop
  89/89; local-server 25/25; renderer and electron typecheck clean; renderer
  and electron bundles built.
- Docs: `CHANGELOG.md`, `docs/BUSINESS_PACK.md` (Cash and bank ledgers),
  `docs/POS.md` (service flow, kitchen tickets) and `docs/PRINTERS.md`
  (kitchen tickets).

Verification: validation 21/21, database 119/119, desktop 89/89, local-server
25/25. Installer not re-packed for this batch.

## 1.0.0 — Release preparation: IN PROGRESS

Done:

- Version bumped to `1.0.0` (root and desktop); installer built:
  `apps/desktop/release/AnalytIQ-Inventory-Setup-1.0.0.exe` (unsigned until the
  certificate is bought; the public key is embedded in the package).
- Production Ed25519 keypair generated: public key embedded in the app, private
  key at `.secrets/license-private.pem` (git-ignored, backup offline). Key
  issuance smoke-tested end-to-end against the embedded public key.
- Code-signing guard: `pnpm dist:signed` (from `apps/desktop`) refuses to build
  unless `CSC_LINK`/`CSC_KEY_PASSWORD` are set. Docs in `docs/UPDATES.md`.
- `docs/RELEASE_CHECKLIST.md` covers vendor material, signing, build,
  clean-machine acceptance, LAN/hardware checks and publishing.

- Local cloud API `.env` configured and verified (`KEY LOADED`); the API now
  loads `.env` at startup (`src/env.ts`) and `nest build` no longer wipes
  `dist` on repeat runs (`incremental: false`).
- Legal drafts: `docs/legal/EULA.md`, `docs/legal/PRIVACY_NOTICE.md`,
  `docs/legal/REFUND_POLICY.md`. Update hosting deferred for 1.0.0.
- Committed as `d1dec18` and tagged `v1.0.0` (no git remote configured yet, so
  not pushed).

Next:

- [ ] Run `bash scripts/backup-license-key.sh`, copy the `.enc` to an encrypted
      USB, store the password in a password manager.
- [ ] Buy the code-signing certificate and build with `pnpm dist:signed`.
- [ ] Run the clean-machine acceptance list in `docs/RELEASE_CHECKLIST.md`
      (includes real scanner and Xprinter checks).
- [ ] Deploy cloud API + website with live Paystack keys; publish legal docs.
- [ ] Add a git remote, then `git push -u origin master --tags`.
