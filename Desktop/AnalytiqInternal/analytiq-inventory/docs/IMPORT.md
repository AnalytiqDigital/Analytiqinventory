# Bulk CSV import

Upload products, purchases and historical sales from a spreadsheet instead of
typing them one by one. The importer is built into the desktop app and also
works from LAN-client tills.

## Where to find it

| What you import | Screen                                      |
| --------------- | ------------------------------------------- |
| Products        | **Products → Import CSV**                   |
| Purchases       | **Purchases → Import CSV**                  |
| Sales           | **Sell → Sales history → Import sales CSV** |

Every dialog has a **Download template** button. Templates are generated from
the same schemas the server validates with, so a file that matches the template
always passes the column checks.

## Row limits

- 5,000 rows per import (split larger files).
- 5 MB per file.

## Products

| Column          | Required | Notes                                                                 |
| --------------- | -------- | --------------------------------------------------------------------- |
| `name`          | yes      | Product name.                                                         |
| `sku`           | no       | Must be unique (case-insensitive).                                    |
| `barcode`       | no       | EAN/UPC or any code. Must be unique.                                  |
| `category`      | no       | Created automatically when missing.                                   |
| `unit`          | no       | Defaults to `pcs`.                                                    |
| `cost_price`    | no       | Naira, e.g. `320.00`. Defaults to 0.                                  |
| `selling_price` | no       | Naira. Defaults to 0.                                                 |
| `reorder_level` | no       | Whole number. Defaults to 0.                                          |
| `opening_stock` | no       | Whole number; creates an opening-count stock movement. Defaults to 0. |
| `tax_category`  | no       | Must match an existing tax category.                                  |

The whole file is validated first and written in one transaction: if any row is
wrong, nothing is imported and every problem is listed with its row number.

## Purchases

Rows that share a `reference` become one purchase (one line per row).

| Column           | Required | Notes                                                                          |
| ---------------- | -------- | ------------------------------------------------------------------------------ |
| `reference`      | yes      | Unique purchase reference (use supplier invoice).                              |
| `supplier`       | yes      | Created automatically when missing.                                            |
| `supplier_phone` | no       | Used when the supplier is created.                                             |
| `date`           | no       | `YYYY-MM-DD`, `YYYY-MM-DD HH:mm` or `DD/MM/YYYY`.                              |
| `sku`            | yes      | Product SKU **or** barcode.                                                    |
| `qty`            | yes      | Whole number.                                                                  |
| `unit_cost`      | yes      | Naira per unit.                                                                |
| `tax`            | no       | Naira tax amount for the line.                                                 |
| `note`           | no       | Purchase note.                                                                 |
| `received`       | no       | `yes`/`true`/`1` marks it received immediately and updates stock + cost price. |

A reference that already exists is refused (`PURCHASE_REFERENCE_EXISTS`), so
re-running the same file cannot double stock.

## Sales

Rows that share a `receipt` become one sale (one line per row).

| Column          | Required | Notes                                     |
| --------------- | -------- | ----------------------------------------- |
| `receipt`       | yes      | Your old receipt/invoice number.          |
| `date`          | no       | Sale date; backdates the sale.            |
| `sku`           | yes      | Product SKU **or** barcode.               |
| `qty`           | yes      | Whole number. Stock must cover it.        |
| `unit_price`    | yes      | Naira per unit.                           |
| `line_discount` | no       | Naira discount for the line.              |
| `tender`        | no       | `cash`, `transfer`, `pos` or `credit`.    |
| `customer`      | no       | Created automatically; needed for credit. |
| `tax`           | no       | Tax amount; defaults to 0 for imports.    |

Sales are created one group at a time. A bad group (unknown SKU, missing stock,
bad date) is reported by row without losing the groups that succeeded. Imported
receipts are stored as an idempotency key: importing the same receipt again is
refused (`SALE_REFERENCE_EXISTS`).

Credit rows automatically set the new customer's credit limit to the amount
owed, so the balance and the limit stay consistent.

## Permissions

| Import    | Permission         |
| --------- | ------------------ |
| Products  | `products.manage`  |
| Purchases | `purchases.manage` |
| Sales     | `sales.create`     |

Cashiers see the sales import only when their role can create sales.
