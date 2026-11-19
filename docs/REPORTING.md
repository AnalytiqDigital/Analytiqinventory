# Reporting

Reports are computed live from the ledger on every request. Nothing is
pre-aggregated and stored, so a report can never drift from the underlying
sales, stock and credit records.

## Where it runs

| Mode                       | Entry point                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Desktop (primary computer) | IPC channel `reports:summary` in `apps/desktop/electron/main.ts`                                   |
| LAN client                 | `GET /api/reports/summary` on the primary computer, routed by `apps/desktop/electron/lanClient.ts` |
| LAN server                 | `apps/local-server/src/server.ts`                                                                  |
| Service                    | `getReportsSummary()` in `packages/database/src/reports.ts`                                        |

All four paths call the same service and require the `reports.view`
permission (admin and manager roles have it; cashiers do not).

## Request

```http
GET /api/reports/summary?from=2026-11-01&to=2026-11-18&locationId=loc_main&topLimit=10
```

| Parameter    | Meaning                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `from`       | Start of the range (inclusive, coerced to a date). Defaults to the start of the current month. |
| `to`         | End of the range (inclusive). Defaults to now.                                                 |
| `locationId` | Optional. Scopes sales, purchases and stock values to one location.                            |
| `topLimit`   | Rows returned in the top-products, top-customers and cashier lists (1–50, default 10).         |

A `from` after `to` is rejected with code `INVALID_RANGE`
(HTTP 400 on the LAN server).

## Response blocks

- `sales` — completed-sale totals: gross, tax, net, discounts, COGS, gross
  profit, average basket, refund/void counts.
- `payments` — cash, transfer, POS and credit tenders with counts.
- `daily` — one row per day in the range (gap-filled, up to 366 days).
- `topProducts`, `topCustomers`, `cashiers` — leaderboards by revenue.
- `inventory` — active products, low-stock count, stock value at cost and
  at retail.
- `purchases` — received purchase orders in the range.
- `credit` — outstanding credit and active customer count.
- `weekly` — Monday-based weeks in the range: transactions, gross, tax, COGS,
  gross profit, expenses and net profit. Expense-only weeks are included.
- `products` — every active product (up to 1,000) with quantity sold and profit
  in the range, on-hand stock and stock value at cost/retail. Products with no
  sales in the range appear with zeroes.
- `stockAlerts` — active products at or below their reorder level (or at/below
  zero), with shortfall, a suggested order (tops up to twice the reorder level)
  and value at cost. Scoped by `locationId` when given.
- `expenses` — total, count and by-category breakdown of expenses paid in the
  range: `{ totalKobo, count, byCategory: [{ category, count, amountKobo }] }`.
- `finance` — `expensesKobo` and `netProfitKobo` (net of tax − COGS − expenses).

The Reports page shows these under tabs: **Overview**, **Products**, **Weekly**
and **Stock alerts**. The Finance page uses the same response for its profit
statement (`docs/FINANCE.md`).

## Known approximation: COGS

Cost of goods sold uses each product's **current** `cost_price_kobo`, which is
refreshed when a purchase is received. Historical cost snapshots are not kept,
so re-pricing a product changes the reported profit of past sales. This is
deliberate (it matches how most small retailers reason about margin) and is
called out here so the number is never mistaken for an audited FIFO/WAC
valuation.

## Tests

- `packages/database/src/reports.test.ts` — arithmetic, filters, permissions,
  empty and inverted ranges.
- `packages/database/src/batch14.test.ts` — weekly buckets, all-product rows,
  stock alerts and expense folding.
- `apps/local-server/src/server.test.ts` — HTTP route, validation and the
  cashier denial.
