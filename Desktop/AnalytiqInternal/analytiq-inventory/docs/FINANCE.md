# Finance: expenses and the profit statement

The **Finance** page records running costs and shows one profit statement
built from the ledger:

```
net sales      = gross sales − tax
gross profit   = net sales − cost of goods sold
net profit     = gross profit − expenses
```

Nothing is posted to a ledger double-entry system; sales and stock movements
stay in their own tables and expenses are a small appendix table, so the
statement is always derived and can never drift.

## Expenses

- Fields: category (Rent, Salaries, Transport, Utilities, Supplies,
  Marketing, Repairs, Other), free-text note, amount in naira, paid-on date,
  and the location it belongs to (defaults to the first location).
- Recording or deleting an expense needs `finance.manage`; viewing the Finance
  page needs `reports.view` (the nav gate) and Manager/Administrator have both.
- Every change writes an audit entry (`expense.create`, `expense.delete`) with
  the category and amount but never the note.

## Expense categories

```ts
// packages/validation/src/index.ts
export const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Transport', 'Utilities',
  'Supplies', 'Marketing', 'Repairs', 'Other',
] as const;
```

## Where it runs

| Mode              | Entry points                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| Desktop (primary) | IPC `finance:expenses`, `finance:create-expense`, `finance:delete-expense`    |
| LAN server        | `GET/POST /api/finance/expenses`, `DELETE /api/finance/expenses/:id`          |
| Service           | `packages/database/src/finance.ts` (expenses), `reports.ts` (statement)       |

The statement itself comes from `reports:summary` / `GET /api/reports/summary`:
`expenses` carries the total, count and by-category breakdown, and `finance`
carries `expensesKobo` and `netProfitKobo`. The weekly block folds expenses
into each Monday-based week.

## CSV export

**Finance → Export CSV** writes the statement, the category breakdown and the
expense list for the selected range.

## Known approximations

- COGS uses current product cost prices (see `docs/REPORTING.md`).
- "Cash received" counts cash tenders only, not transfers, card or credit.
- Expenses are recorded when paid, not when accrued.

## Tests

- `packages/database/src/batch14.test.ts` — expense CRUD, permission refusal,
  statement arithmetic (gross profit 26,000 − expenses 520,000 = −494,000)
  and the weekly bucket.
- `apps/local-server/src/server.test.ts` — HTTP routes, cashier refusal.
