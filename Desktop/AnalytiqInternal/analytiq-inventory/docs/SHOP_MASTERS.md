# Shop masters, adjustments, returns and labels

This batch fills the gaps between the reference ERP menu and what the app
shipped with: master lists for units, brands, warranties and customer groups,
a stock-adjustment screen, purchase returns, printable shelf labels and the ten
extra report tabs.

## Menu structure

The sidebar groups items the way the reference ERP does:

| Group     | Items                                                                      |
| --------- | -------------------------------------------------------------------------- |
| Main      | Dashboard (always expanded)                                                |
| Sell      | Point of Sale, Tables\*, Returns\*                                         |
| Products  | List Products, Print Labels, Units/Brands/Groups, Price Lists\*, Batches\* |
| Inventory | Stock Levels, Stock Adjustments, Stock Transfers\*                         |
| Purchases | Purchases\*, Purchase Returns\*                                            |
| Contacts  | Customers\*, Suppliers\*, Debtors\*                                        |
| Reports   | All Reports, Profit & Loss                                                 |
| Finance   | Finance\*, Expenses\*                                                      |
| Setup     | Users & Roles, Tax Categories\*, Install Modules, Settings, Help           |

Items marked \* only appear when the business has the matching optional module.
Every item also keeps its permission gate, so a cashier still cannot see
Settings, for example.

Group headers collapse by clicking them; the collapsed set is stored in
`localStorage` under `analytiq.nav.collapsed`, so the choice survives restarts
on that machine. A group whose whole list is hidden by permissions or modules
is not rendered at all.

## Units, Brands & Groups (`/masters`)

One tabbed screen manages four kinds of master data:

| Tab             | Fields                       | Permission         |
| --------------- | ---------------------------- | ------------------ |
| Units           | name, short name, note       | `products.manage`  |
| Brands          | name, note                   | `products.manage`  |
| Warranties      | name, duration in days, note | `products.manage`  |
| Customer groups | name, note                   | `customers.manage` |

Names are unique per business, compared case-insensitively (`MASTER_EXISTS`,
HTTP 409 on the LAN server). Records can be renamed, re-noted and switched off
instead of being deleted, so historical products keep their references.

The product form offers active brands and warranties; the unit field suggests
existing units while still accepting free text. The customer form offers active
customer groups.

LAN: `GET /api/masters/:kind`, `POST /api/masters/:kind`,
`PATCH /api/masters/:kind/:id` with `kind` one of `brands`, `units`,
`warranties`, `customer-groups`. Desktop IPC mirrors them as
`masters:list/create/update`.

## Stock adjustments (`/stock-adjustments`)

Count corrections, damage write-offs and found stock, kept separate from
purchases:

- Each adjustment has a reason (3–200 characters), an optional branch (default
  branch when blank) and one or more product lines with a signed quantity.
- References are sequential per business: `ADJ-000001`, `ADJ-000002`, …
- A line that would push on-hand below zero is refused with `NEGATIVE_STOCK`
  and nothing is written (single transaction).
- Lines are stored as `stock_adjustment` movements, so Stock Levels, movements
  history and every report see them immediately.
- The list shows reference, date, branch, reason, line count and the signed net
  quantity; the LAN route also emits `inventory.changed` for connected tills.

LAN: `GET /api/stock-adjustments`, `POST /api/stock-adjustments`. IPC:
`stockAdjustments:list`, `stockAdjustments:create`.

## Purchase returns (`/purchase-returns`)

Send stock back to a supplier against the purchase it came from:

- Only `received` purchases can be returned (`PURCHASE_NOT_RECEIVED`).
- A product can appear once per return (`DUPLICATE_LINE`); the quantity is
  capped by what was bought minus everything already returned on that purchase
  (`RETURN_QTY_EXCEEDED`).
- The return value uses the purchase's weighted unit cost and is stored on the
  return so Purchase Payments can subtract it.
- Stock leaves with a `purchase_return` movement, so on-hand and cost value
  follow. A return that would go below zero is refused.
- References are sequential: `PRT-000001`, `PRT-000002`, …

LAN: `GET /api/purchase-returns`, `POST /api/purchase-returns`. IPC:
`purchaseReturns:list`, `purchaseReturns:create`. The screen sits behind the
`purchases` module and `purchases.manage`.

## Print labels (`/labels`)

Shelf and product labels printed on a normal A4 printer:

- Search products, set copies per row, or select all visible rows; the default
  copy count applies to newly found products.
- **Only products with a barcode** hides rows without a code.
- A label is 50 × 30 mm and shows the business name, product name, selling
  price and the barcode.
- Barcodes that pass the EAN-13 checksum are drawn as real bars from the
  95-module encoding (`apps/desktop/src/lib/ean13.ts`); any other code prints
  as readable text and the row is tagged "(not EAN-13)".
- Printing writes the sheet into a hidden iframe and calls `print()`, so no
  popup blocker is involved and the app window is not replaced.

Requires `products.manage`.

## Report tabs

Reports now opens with Overview, Products, Weekly and Stock alerts, then the
ten menu reports: Purchase & Sale, Tax, Suppliers & Customers, Customer Groups,
Stock Adjustments, Product Purchases, Purchase Payments, Sell Payments,
Registers and Sales Representatives. They share the date range picker and load
on demand through `reports:menu` / `GET /api/reports/menu`
(see `docs/REPORTING.md`).

## Users & Roles

The staff screen now has two tabs: **Users** (staff list and add/edit modal)
and **Roles** (per-role permission matrix). Only one is on screen at a time,
which keeps long permission lists from pushing the staff table down.

## Tests

- `packages/database/src/batch16.test.ts` — masters CRUD and uniqueness,
  adjustment guard, purchase return cap, menu report totals.
- `apps/desktop/src/lib/ean13.test.ts` — checksum, validity and encoding.
- `apps/desktop/src/pages/PrintLabelsPage.test.tsx` — label HTML, escaping,
  EAN vs plain barcode, A4 document.
- `apps/desktop/src/components/reports/MenuReportsPanel.test.tsx` — each tab
  renders its data and empty states.
- `apps/desktop/src/components/layout/nav.test.ts` — module and permission
  gating, including the new Phase 1 screens.
- `apps/local-server/src/server.test.ts` — every new route, from masters CRUD
  to opening-stock idempotency and the menu report response.
