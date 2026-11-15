# Products and Inventory (Batch 4)

## Data model

- `categories` — per-business, unique name per business.
- `products` — name, optional SKU / barcode (unique per business when set;
  NULLs never collide), category, unit, cost/selling price in integer kobo,
  reorder level, active flag.
- `stock_movements` — the append-only ledger. Every row carries business,
  product, location, kind, `qty_delta`, running `qty_after` snapshot, reason,
  acting user, timestamp.

## Ledger rule

Stock on hand is **always** `SUM(qty_delta)` over the ledger. There is no
balance column to overwrite. Receipts (`opening`), corrections (`adjust`),
physical counts (`count`), and later sales/purchases/returns append rows.
Adjustments that would take on-hand below zero are rejected with
`NEGATIVE_STOCK` and roll back.

## Operations

| Operation | Permission | Notes |
|---|---|---|
| Create / update / archive / restore product | `products.manage` | Opening stock posts an `opening` movement atomically |
| Create category | `products.manage` | Names unique per business |
| Adjust stock (+/-) | `inventory.adjust` | Requires reason ≥ 3 chars; refuses negative on-hand |
| Post stock count | `inventory.adjust` | Snaps to counted qty via delta movement |
| View products / levels / movements | any signed-in user | Product list requires no special grant; nav shows Inventory to `inventory.view` |

Products are never deleted — archiving hides them from the default list
(`includeInactive` reveals them) while history stays intact. SKUs/barcodes
identify items at future POS and receiving flows.

## Desktop UI

- `/products` — searchable, sortable table with category filter, price in
  Naira, on-hand with low-stock badges, create/edit/archive/restore.
- `/products/:id` — price cards, details, per-location levels, recent
  movement history.
- `/inventory` — per-location levels with low-stock filter, adjust/count
  dialogs, global recent-movements feed.
