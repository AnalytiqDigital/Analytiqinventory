# POS and Cash Register (Batch 5)

## Data model

- `sales` — header per completed sale: business, location, receipt number
  (unique per business, `R-YYYYMMDD-NNNNN`), cashier, status
  (`completed` | `refunded` | `voided`), subtotal, line-discount total,
  header discount, tax, total, amount paid, change — all in integer kobo.
- `sale_items` — one row per cart line: product, qty, unit price, line
  discount, line total.
- `sale_payments` — one row per tender: method (`cash` | `transfer` |
  `pos` | `credit`), amount, optional reference (transfer/POS ref).
- `sale_reversals` — one row per refund/void: sale, reason, actor,
  timestamp. Sales are never deleted.

## Sale rules

- A sale is one atomic transaction: header + items + payments + stock
  ledger rows + audit. Partial writes never happen.
- Each line appends a `sale` row to `stock_movements` (negative
  `qty_delta`). Insufficient stock rejects the whole sale with
  `NEGATIVE_STOCK`.
- Refunds and voids append offsetting `return` rows and a reversal
  record, then flip status. Double reversal is rejected with
  `ALREADY_REVERSED`. Refund vs void is a status distinction (customer
  return vs same-day correction); both restock.
- Discounts: per-line `lineDiscountKobo` (clamped to the line gross) plus
  one header discount (clamped to net after lines). Tax defaults to the
  business rate applied to (subtotal − discounts); an explicit per-sale
  tax can override it.
- Payments: split tender allowed; `sum(payments)` must cover the total.
  Overpay yields change. `credit` (pay-later, walk-in, no customer record
  until Batch 6) must match exactly — no change, no shortfall.
- No customer records in Batch 5: all sales are walk-in. The customer
  ledger (Batch 6) will attach credit sales to accounts.

## Operations

| Operation | Permission | Notes |
|---|---|---|
| Checkout (`sales:create`) | `sales.create` | Validates cart, stock, payment coverage atomically |
| View history / receipt (`sales:list`, `sales:get`) | `sales.view` | Paginated, filterable by location/status/search |
| Refund / void | `sales.refund` | Requires reason ≥ 3 chars; restocks via `return` rows |

## Desktop UI (`/pos`)

- Product search (name/SKU/barcode, Enter adds first match), cart with
  qty/price/discount editing, header discount, live totals with tax
  estimate (authoritative tax computed server-side).
- Tender dialog: per-line method picker, split payments, reference field
  for transfer/POS, paid/remaining/change readout.
- Receipt view: monospace layout, prints via a print-styled popup window
  — works with POS thermal printers (80mm) and standard A4/Letter
  printers through the OS print dialog.
- Sales history: paginated list, receipt detail, refund/void with reason
  (manager permission).

## Restaurant pack (tables, tax categories, photos)

- **Tax categories** (`/tax-categories`, Setup) hold a name and a rate in
  basis points, with exactly one default per business. A product picks a
  category; a sale line is taxed at that category's rate, falling back to the
  business rate when the product has none. A header discount is spread across
  lines proportionally before tax is computed.
- **Tables** (`/tables`) is the floor map: cards show name, seats, note and
  free/occupied status. Add, rename, mark busy/free, or delete (deletion is
  refused while a table is occupied or referenced by a sale). "Start order"
  opens the POS with `?table=<id>` preselected.
- **POS table selector**: a Takeaway chip plus every table. Occupied tables are
  highlighted; picking one tags the sale, occupies the table inside the
  checkout transaction and frees it once the sale completes. The table appears
  on the cart, the printed receipt and sales-history rows.
- **Product photos**: uploaded images are downscaled to a 640 px JPEG data URL
  and stored in `products.image_path`, so they render with no network and are
  included in the single-file SQLite backup. Products without a photo show a
  branded placeholder tile.
