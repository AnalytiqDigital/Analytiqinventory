import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Calculator,
  Download,
  Landmark,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ConfirmDialog, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { ExpenseRow, ReportsSummary } from '../types/global';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Transport',
  'Utilities',
  'Supplies',
  'Marketing',
  'Repairs',
  'Other',
] as const;

function dateInput(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function naira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

function buildCsv(
  summary: ReportsSummary,
  expenses: ExpenseRow[],
  from: string,
  to: string
): string {
  const lines: Array<Array<string | number>> = [
    ['AnalytIQ profit statement'],
    ['From', from],
    ['To', to],
    [],
    ['Line', 'Amount (NGN)'],
    ['Gross sales', naira(summary.sales.grossKobo)],
    ['Tax collected', naira(summary.sales.taxKobo)],
    ['Net sales', naira(summary.sales.netKobo)],
    ['Cost of goods sold', naira(summary.sales.cogsKobo)],
    ['Gross profit', naira(summary.sales.grossProfitKobo)],
    ['Expenses', naira(summary.expenses.totalKobo)],
    ['Net profit', naira(summary.finance.netProfitKobo)],
    [],
    ['Expense category', 'Count', 'Amount (NGN)'],
    ...summary.expenses.byCategory.map((c) => [c.category, c.count, naira(c.amountKobo)]),
    [],
    ['Date', 'Category', 'Note', 'Recorded by', 'Amount (NGN)'],
    ...expenses.map((e) => [
      new Date(e.paidAt).toLocaleDateString(),
      e.category,
      e.note,
      e.createdByName,
      naira(e.amountKobo),
    ]),
  ];
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}

interface ExpenseForm {
  category: string;
  note: string;
  amount: string;
  paidAt: string;
}

export function FinancePage(): JSX.Element {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => dateInput(startOfMonth()));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [values, setValues] = useState<ExpenseForm>({
    category: 'Rent',
    note: '',
    amount: '',
    paidAt: dateInput(new Date()),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = endOfDay(new Date(`${to}T00:00:00`));
  const validRange = fromDate.getTime() <= toDate.getTime();
  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  const summaryQuery = useQuery({
    queryKey: ['finance-summary', fromIso, toIso],
    enabled: validRange,
    queryFn: async () => {
      const res = await ipc.reportsSummary({ from: fromIso, to: toIso });
      if (!res.ok || !res.summary) throw new Error(res.error ?? 'Could not load the statement');
      return res.summary;
    },
  });

  const expensesQuery = useQuery({
    queryKey: ['expenses', fromIso, toIso],
    enabled: validRange,
    queryFn: async () => {
      const res = await ipc.expenses({ from: fromIso, to: toIso });
      if (!res.ok) throw new Error(res.error ?? 'Could not load expenses');
      return res;
    },
  });

  const summary = summaryQuery.data;
  const expenses = expensesQuery.data?.items ?? [];

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amountKobo = parseNairaToKobo(values.amount.trim());
      if (amountKobo === null || amountKobo <= 0) throw new Error('Enter an amount like 25000.00');
      const paidAt = new Date(`${values.paidAt}T12:00:00`);
      if (Number.isNaN(paidAt.getTime())) throw new Error('Choose the date it was paid');
      const res = await ipc.expenseCreate({
        category: values.category,
        note: values.note.trim(),
        amountKobo,
        paidAt: paidAt.toISOString(),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not record the expense');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setValues({ category: 'Rent', note: '', amount: '', paidAt: dateInput(new Date()) });
      setFormError(null);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (expense: ExpenseRow) => {
      const res = await ipc.expenseDelete(expense.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not delete the expense');
    },
    onSuccess: async () => {
      setDeleting(null);
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => {
      setDeleting(null);
      setActionError(e.message);
    },
  });

  const cashReceived = useMemo(
    () =>
      (summary?.payments ?? [])
        .filter((p) => p.method === 'cash')
        .reduce((sum, p) => sum + p.amountKobo, 0),
    [summary]
  );

  function presetMonth(offset: number): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    setFrom(dateInput(start));
    setTo(dateInput(end));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Expenses and a profit statement: sales − cost of goods − expenses.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={!summary}
            onClick={() => {
              if (!summary) return;
              downloadFile(
                `analytiq-profit-${from}-to-${to}.csv`,
                buildCsv(summary, expenses, from, to)
              );
            }}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => presetMonth(0)}>
              This month
            </Button>
            <Button size="sm" variant="secondary" onClick={() => presetMonth(-1)}>
              Last month
            </Button>
          </div>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </CardContent>
      </Card>

      {!validRange ? <ErrorState message="The start date must be before the end date." /> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {summaryQuery.isLoading || expensesQuery.isLoading ? (
        <LoadingState label="Building your statement…" />
      ) : null}
      {summaryQuery.isError ? (
        <ErrorState
          message={(summaryQuery.error as Error).message}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : null}
      {expensesQuery.isError ? (
        <ErrorState
          message={(expensesQuery.error as Error).message}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Stat
              icon={Banknote}
              label="Gross sales"
              value={formatKobo(summary.sales.grossKobo)}
              sub={`${summary.sales.transactions} transactions`}
              tone="emerald"
            />
            <Stat
              icon={Calculator}
              label="Cost of goods sold"
              value={formatKobo(summary.sales.cogsKobo)}
              sub="at current product cost"
              tone="amber"
            />
            <Stat
              icon={TrendingDown}
              label="Gross profit"
              value={formatKobo(summary.sales.grossProfitKobo)}
              sub={`Margin ${
                summary.sales.netKobo > 0
                  ? Math.round((summary.sales.grossProfitKobo / summary.sales.netKobo) * 100)
                  : 0
              }%`}
              tone="brand"
            />
            <Stat
              icon={Receipt}
              label="Expenses"
              value={formatKobo(summary.expenses.totalKobo)}
              sub={`${summary.expenses.count} recorded`}
              tone="violet"
            />
            <Stat
              icon={Wallet}
              label="Net profit"
              value={formatKobo(summary.finance.netProfitKobo)}
              sub="after expenses"
              tone={summary.finance.netProfitKobo >= 0 ? 'emerald' : 'amber'}
            />
            <Stat
              icon={Landmark}
              label="Cash received"
              value={formatKobo(cashReceived)}
              sub="cash payments in this period"
              tone="sky"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="py-6 text-sm text-slate-500">
                    No expenses recorded in this period.
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TRow>
                        <TH>Date</TH>
                        <TH>Category</TH>
                        <TH>Note</TH>
                        <TH className="text-right">Amount</TH>
                        <TH className="text-right">Actions</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {expenses.map((expense) => (
                        <TRow key={expense.id}>
                          <TD>{new Date(expense.paidAt).toLocaleDateString()}</TD>
                          <TD>
                            <Badge>{expense.category}</Badge>
                          </TD>
                          <TD className="max-w-[220px] truncate text-slate-500">
                            {expense.note || '—'}
                          </TD>
                          <TD className="tabular-nums text-right font-medium">
                            {formatKobo(expense.amountKobo)}
                          </TD>
                          <TD>
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Delete ${expense.category} expense`}
                                onClick={() => setDeleting(expense)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expenses by category</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.expenses.byCategory.length === 0 ? (
                  <p className="py-6 text-sm text-slate-500">Nothing to break down yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.expenses.byCategory.map((c) => {
                      const share =
                        summary.expenses.totalKobo > 0
                          ? Math.round((c.amountKobo / summary.expenses.totalKobo) * 100)
                          : 0;
                      return (
                        <li key={c.category}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-300">{c.category}</span>
                            <span className="tabular-nums font-medium">
                              {formatKobo(c.amountKobo)}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {c.count} entr{c.count === 1 ? 'y' : 'ies'} · {share}%
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Modal open={modalOpen} title="Record an expense" onClose={() => setModalOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Category
            </label>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.category}
              onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            >
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount (₦)"
            inputMode="decimal"
            placeholder="25000.00"
            value={values.amount}
            onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
          />
          <Input
            label="Paid on"
            type="date"
            value={values.paidAt}
            onChange={(e) => setValues((v) => ({ ...v, paidAt: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Save expense
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete expense"
        message={`Delete the ${deleting?.category ?? ''} expense of ${
          deleting ? formatKobo(deleting.amountKobo) : ''
        }? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
