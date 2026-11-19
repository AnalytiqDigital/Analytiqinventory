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
