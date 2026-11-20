# Finance: expenses and the profit statement

The **Finance** page shows one profit statement built from the ledger:

```
net sales      = gross sales − tax
gross profit   = net sales − cost of goods sold
net profit     = gross profit − expenses
```

Nothing is posted to a ledger double-entry system; sales and stock movements
stay in their own tables and expenses are a small appendix table, so the
statement is always derived and can never drift.

## Expenses module

The **Expenses** page (Manage → Expenses, `/expenses`) is the day-to-day
ledger. It is an optional module named `expenses`, installed by default for
every business type and switchable from Settings → Install modules. Switching
it off hides the menu entry and route but keeps the data and the Finance
statement.

- Date range presets (this month, last month, this year) plus a custom range,
  a category filter and a note/category search.
- Totals for the current selection: total spent, number of entries, average
  per entry and the biggest category, followed by the row-by-row ledger with
  the staff member who recorded each expense.
- Add, edit and delete from the page; Export CSV writes the filtered rows and
  a balancing total.

## Expense fields and permissions

- Fields: category (Rent, Salaries, Transport, Utilities, Supplies,
  Marketing, Repairs, Other), free-text note, amount in naira, paid-on date,
  and the location it belongs to (defaults to the first location).
- Recording, editing or deleting an expense needs `finance.manage`; the nav
  entry uses the same permission, and Manager/Administrator have it. Viewing
  the Finance statement still needs `reports.view`.
- Every change writes an audit entry (`expense.create`, `expense.update`,
  `expense.delete`) with the category and amount but never the note.

## Expense categories

```ts
// packages/validation/src/index.ts
export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Transport',
  'Utilities',
  'Supplies',
  'Marketing',
  'Repairs',
  'Other',
] as const;
```

## Where it runs

| Mode              | Entry points                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Desktop (primary) | IPC `finance:expenses`, `finance:create-expense`, `finance:update-expense`, `finance:delete-expense` |
| LAN server        | `GET/POST /api/finance/expenses`, `PATCH/DELETE /api/finance/expenses/:id`                           |
| Service           | `packages/database/src/finance.ts` (expenses), `reports.ts` (statement)                              |

The statement itself comes from `reports:summary` / `GET /api/reports/summary`:
`expenses` carries the total, count and by-category breakdown, and `finance`
carries `expensesKobo` and `netProfitKobo`. The weekly block folds expenses
into each Monday-based week.

## CSV export

**Finance → Export CSV** writes the statement, the category breakdown and the
expense list for the selected range. **Expenses → Export CSV** writes only the
currently filtered ledger (with a total row), which is the file to give an
accountant.

## Known approximations

- COGS uses current product cost prices (see `docs/REPORTING.md`).
- "Cash received" counts cash tenders only, not transfers, card or credit.
- Expenses are recorded when paid, not when accrued.

## Tests

- `packages/database/src/batch14.test.ts` — expense create/update/delete,
  permission refusal, statement arithmetic (gross profit 26,000 − expenses
  520,000 = −494,000) and the weekly bucket.
- `apps/local-server/src/server.test.ts` — HTTP routes including `PATCH`,
  cashier refusal.
- `apps/desktop/src/pages/ExpensesPage.test.tsx` — list totals, category and
  search filters, add, edit and delete (5 tests).
- `apps/desktop/src/components/layout/nav.test.ts` — the menu entry needs
  `finance.manage` and the installed `expenses` module.
- `packages/validation/src/modules.test.ts` — `expenses` is on for every
  business type by default and can be switched off.
