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

## Next

Batch 6: Customers, suppliers, purchasing.
