# Business pack: batches, price lists, loyalty, returns, transfers, debtors and offsite backup

Batch 15 added the modules that make the app fit different kinds of shops —
pharmacies and provision stores, wholesalers, lounges and restaurants,
electronics and boutiques — without two separate builds. Each business type
installs a different starting set of modules, and a manager can switch any
optional module on or off later.

## Install modules by business type

Setup asks for the business type. That choice picks a preset:

| Business type             | Optional modules installed                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Retail / provision store  | tax categories, purchases, suppliers, customers, finance, expenses, expiry, loyalty, returns, transfers |
| Supermarket / wholesale   | as retail, plus price tiers                                                                             |
| Pharmacy                  | as retail (no price tiers)                                                                              |
| Restaurant / bar / lounge | tables, tax categories, purchases, suppliers, customers, finance, expenses, loyalty, returns            |
| Electronics               | as retail plus price tiers                                                                              |
| Boutique                  | as retail minus expiry                                                                                  |
| Services                  | tax categories, purchases, customers, finance, expenses, loyalty, returns                               |

The `expenses` module adds the Manage → Expenses ledger (`/expenses`); it is
installed for every type and can be switched off without losing data. The
Finance module keeps the profit statement.

Setup → **Install Modules** lists every module with a one-line description and
a switch. The switch writes only the differences from the preset, so changing
the business type later still gives sensible defaults. The menu, screens,
customer profile and POS features update immediately after saving.

Modules hidden by the switch are hidden from the menu, but no data is deleted;
turning a module back on shows the same records again.

## Batches and expiry (pharmacy, provisions, drinks)

1. Open **Products → Edit** and tick **Track batches & expiry**. Set how many
   days before expiry an alert should start (default 30).
2. Receive stock with a batch number and expiry date, either through
   **Purchases** (batch fields appear on lines for tracked products) or
   **Batches & Expiry → Receive batch**.
3. **Sell** draws stock from the earliest-expiring batch first (First Expired,
   First Out). Only tracked products use batches; everything else keeps the
   plain stock ledger.

**Batches & Expiry** lists every batch with remaining quantity and a status
badge: OK, `Expires in Nd`, Expired or Empty. Filter by 30/90 days or expired,
and optionally show batches that have been fully sold.

Returns put stock back into the exact batches the sale consumed, so a refund
does not silently create fresh stock with the old expiry date.

## Wholesale price tiers and customer price lists

**Manage → Price Lists** holds any number of tiers (for example Wholesale,
Retail, VIP). For each tier, set an override price per product; a blank cell
means "use the normal selling price", so a new tier starts as a copy of retail.

Assign a tier on the customer record. On the Sell screen a sale to that
customer starts with the tier price, and the cashier can still type a
different price if needed. Walk-in customers always use the normal price.

## Loyalty points and simple CRM

Settings → **Loyalty** controls earnings: how much spend earns one point and
what one point is worth at redemption (default: 1 point per ₦100, 1 point =
₦1). Points are a ledger — the balance is always the sum of entries, never a
running counter.

On Sell, choose a customer and type how many points to redeem; the app clamps
the redemption to the customer's balance and to the order value. Receipts show
the loyalty discount and the points earned on that sale.

**Customers → Profile** shows visit summary (sales count, spend, last visit),
point balance and entries (with manual adjustment), and notes for staff. This
is the whole CRM: enough to remember a regular without a separate system.

## Counter returns and exchanges

**Sell → Returns** is designed for the counter:

1. Scan or type the receipt number.
2. Pick the lines and quantities coming back. The app shows how many are
   still returnable on each line (previous returns are subtracted).
3. Choose refund method and reason. Refund is capped at what is left of the
   sale, even across several partial returns.
4. Save. Stock is restocked to the consumed batches and a return row is
   recorded. When every line has come back in full, the sale is marked
   refunded.

For an **exchange**, record the return with kind "exchange", then ring the
replacement as a normal sale — the return history still shows both sides.

Reversed (refunded or voided) sales cannot be returned again. Returns need the
`sales.refund` permission; browsing history needs `sales.view`.

## Stock transfers between branches

**Manage → Transfers** moves stock between two branches in one step. Each line
writes two ledger entries — `transfer_out` at the source and `transfer_in` at
the destination — so on-hand stock at both branches stays correct. Batched
products keep their batch number and expiry at the destination.

A transfer to the same branch is refused, and so is any transfer that would
push the source negative. References run `TRF-000001`, `TRF-000002`, …

## Debtor reminders (WhatsApp)

Credit limits already existed; **Manage → Debtors** lists customers who owe
money with the balance and when they were last reminded. Tick the customers
(or select all), preview the message, then send.

Reminders use the WhatsApp automation configured in Settings → Automation.
With WhatsApp unconfigured the preview reports exactly what would be sent and
nothing leaves the machine, which is a safe way to check the list. A reminder
is only sent to customers who have a phone number.

## Encrypted offsite backup

Settings → **Cloud backup** protects against the machine dying. Enable it with
an `https://` endpoint, an optional bearer key and a passphrase, then either
press **Back up now** or let the daily schedule run it.

- The database snapshot is encrypted on this machine with AES-256-GCM (key
  derived from the passphrase with scrypt) into a `.aqb` file. The server only
  ever receives ciphertext; the passphrase is never uploaded, so keep it
  somewhere safe — without it the file cannot be restored.
- Upload uses `PUT <url>` with `Authorization: Bearer <key>` (when a key is
  set) and an `x-analytiq-file` header naming the file. Any HTTPS endpoint that
  accepts PUT works — S3-compatible storage, a small VPS, or your own service.
- Recent uploads and their sizes are listed in the card. Keep the local backup
  option on as well unless you have another plan for quick restores.

## Cash and bank ledgers

Finance → **Cash & Bank** (`/accounts`) keeps the money side of the books.
An account has a name, a type (cash drawer, bank account, POS terminal,
mobile money) and an opening balance; the balance shown is the opening balance
plus every movement posted to it.

- **Automatic posting.** Every completed sale posts its tenders to the matching
  account (cash after change is given), refunds post a negative entry, voids
  post reversing entries, expenses and customer payments post too. Posting
  happens inside the same SQLite transaction as the sale, so a failed write
  leaves neither a sale without money nor money without a sale. Credit tenders
  post nothing until the customer pays.
- **Payment mapping.** By default cash goes to the cash drawer, transfers to a
  bank account and POS payments to the POS account. The business can pin a
  tender to a specific account instead.
- **Move money** transfers between two accounts with a paired out/in entry and
  refuses to overdraw the source. **Adjust** records a signed correction
  (positive = float added, negative = cash taken out) and requires a reason.
- Accounts with a non-zero balance cannot be archived, and the default account
  must be moved first. Every write is audited (`account.create`,
  `account.update`, `account.transfer`, `account.adjust`).
- The **ledger** table lists movements with the account, type, note/reference
  and signed amount, plus money-in and money-out totals for the selection. It
  can be filtered to one account.

Restaurant service charge and tips are stored on the sale (`service_charge_kobo`,
`tip_kobo`) and are part of the amount the customer tenders, so they reach the
ledger as part of the sale posting.

## Permissions

| What                                     | Permission                                         |
| ---------------------------------------- | -------------------------------------------------- |
| Batches: view                            | `inventory.view`                                   |
| Batches: receive                         | `inventory.adjust`                                 |
| Price lists                              | `products.manage`                                  |
| Loyalty settings, modules, cloud backup  | `settings.manage`                                  |
| Loyalty points, notes (customer profile) | `customers.manage`                                 |
| Returns                                  | `sales.refund` (create), `sales.view` (history)    |
| Transfers                                | `inventory.view` (UI), `inventory.adjust` (create) |
| Debtors                                  | `customers.manage`                                 |
| Cash & bank, expense "paid from"         | `finance.manage`                                   |
| Service charge default                   | `settings.manage`                                  |

Cashiers keep working with `sales.create`; nothing in this pack widens what a
cashier can do except redeeming loyalty points, which is a discount on their
own sale.
