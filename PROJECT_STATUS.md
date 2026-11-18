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

## Next

Batch 8: cloud sync + multi-location.
