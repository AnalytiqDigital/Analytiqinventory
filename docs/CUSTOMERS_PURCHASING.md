# Customers, Suppliers and Purchasing (Batch 6)

Batch 6 adds the two contact books a shop actually runs on — customers who buy
on credit, and suppliers you buy stock from — plus a purchase ledger that brings
stock into inventory.

## Data model

Migration `0006_batch6_contacts_purchasing.sql`:

| Table | Purpose |
| --- | --- |
| `customers` | Name, phone, email, address, note, `credit_limit_kobo`, `is_active`. Unique per business by name+phone index. |
| `suppliers` | Name, contact person, phone, email, address, note, `is_active`. |
| `purchases` | `reference` (`PUR-000001`, per business), `status` (`draft`/`received`/`cancelled`), supplier, location, subtotal/tax/total/paid in kobo, note, `received_at`, `received_by`. |
| `purchase_items` | Product, qty, `unit_cost_kobo`, `line_total_kobo`. |
| `customer_payments` | Amount, method (`cash`/`transfer`/`pos`), reference, optional `sale_id`, user, timestamp. |
| `sales.customer_id` | Nullable link from a sale to the customer who owes it. |

Money is integer kobo everywhere, as in the rest of the app.

## Customers and credit

- A customer's **balance** is derived, never stored: the sum of credit payments
  on their sales minus the payments they have made. Nothing to drift.
- `credit_limit_kobo` of `0` means "no credit allowed" — a credit sale to that
  customer is refused. A non-zero limit is checked against
  `outstanding + this sale` before the sale is written (`CREDIT_LIMIT_EXCEEDED`).
- A credit sale must be **paid exactly**: the credit line covers the whole bill,
  so there is no change and no shortfall (`CREDIT_MUST_MATCH`). Part-cash,
  part-credit works by splitting the tender — cash for what they hand over,
  credit for the rest.
- Credit without a customer is refused (`CREDIT_REQUIRES_CUSTOMER`).
- A customer with an outstanding balance cannot be archived
  (`CUSTOMER_HAS_BALANCE`); settle first, then archive.
- `recordCustomerPayment` takes cash/transfer/POS against the account and
  returns the new balance. Payments are append-only history, shown per customer.

## Suppliers and purchases

- Suppliers are a plain contact book with a purchase count for context.
- A purchase is created as a **draft**: it records what was ordered and at what
  cost, but moves no stock.
- `receivePurchase` is the only thing that touches inventory. It writes one
  `purchase` stock movement per line inside a single transaction, stamps
  `received_at`/`received_by`, and flips the status to `received`. Receiving
  twice is refused, so stock can never be double-counted.
- `cancelPurchase` closes a draft without moving stock.
- Purchases are listed with their lines, filterable by status, supplier and
  reference.

## Permissions and modules

| Permission | Gates |
| --- | --- |
| `customers.manage` | Create/update/archive customers, record payments |
| `suppliers.manage` | Create/update/archive suppliers |
| `purchases.manage` | Create/receive/cancel purchases |

The `customers`, `suppliers` and `purchases` optional modules decide whether the
pages and nav items appear at all for a business type. The POS customer picker
only loads when the `customers` module is on.

## Desktop surface

- **Customers** page — search, archived toggle, credit limit and live balance,
  create/edit, record payment, payment history, archive/restore.
- **Suppliers** page — search, archived toggle, contact details, purchase count,
  create/edit, archive/restore.
- **Purchases** page — status/supplier filters, expandable rows showing lines and
  totals, new purchase with a multi-line item editor, receive and cancel.
- **POS** — a customer selector next to the table selector. Picking a customer
  unlocks the *Credit (pay later)* tender and a "put remaining on credit"
  shortcut; the sale is written with `customer_id` and the balance lands on the
  customer's account.

## Tests

`packages/database/src/batch6.test.ts` covers customer CRUD and validation,
archive-with-balance refusal, credit sales (balance, missing customer, limit,
change owing), payment settlement, supplier CRUD, and the purchase lifecycle
(draft moves no stock, receive moves it once, double receive refused).

Note: `better-sqlite3` is built for Electron's ABI, so the database tests must
run under Electron's Node (`ELECTRON_RUN_AS_NODE=1`) or after rebuilding the
module for the local Node version. See `KNOWN_ISSUES.md`.
