import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Calculator,
  Download,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import { EXPENSE_CATEGORIES } from '@analytiq/validation';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { ConfirmDialog, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { ExpenseRow } from '../types/global';

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

function buildCsv(rows: ExpenseRow[], from: string, to: string): string {
  const totalKobo = rows.reduce((sum, e) => sum + e.amountKobo, 0);
  const lines: Array<Array<string | number>> = [
    ['AnalytIQ expenses'],
    ['From', from],
    ['To', to],
    [],
    ['Date', 'Category', 'Note', 'Recorded by', 'Amount (NGN)'],
    ...rows.map((e) => [
      new Date(e.paidAt).toLocaleDateString(),
      e.category,
      e.note,
      e.createdByName,
      (e.amountKobo / 100).toFixed(2),
    ]),
    [],
    ['Total', '', '', '', (totalKobo / 100).toFixed(2)],
  ];
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}

interface ExpenseForm {
  category: string;
  note: string;
  amount: string;
  paidAt: string;
}

function emptyForm(): ExpenseForm {
  return { category: 'Rent', note: '', amount: '', paidAt: dateInput(new Date()) };
}

export function ExpensesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => dateInput(startOfMonth()));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [values, setValues] = useState<ExpenseForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = endOfDay(new Date(`${to}T00:00:00`));
  const validRange = fromDate.getTime() <= toDate.getTime();
  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  const expensesQuery = useQuery({
    queryKey: ['expenses', fromIso, toIso],
    enabled: validRange,
    queryFn: async () => {
      const res = await ipc.expenses({ from: fromIso, to: toIso, limit: 500 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load expenses');
      return res;
    },
  });

  const items = expensesQuery.data?.items ?? [];
  const trimmedSearch = search.trim().toLowerCase();

  const rows = useMemo(
    () =>
      items.filter((expense) => {
        if (category !== 'all' && expense.category !== category) return false;
        if (!trimmedSearch) return true;
        return (
          expense.note.toLowerCase().includes(trimmedSearch) ||
          expense.category.toLowerCase().includes(trimmedSearch)
        );
      }),
    [items, category, trimmedSearch]
  );

  const totalKobo = rows.reduce((sum, e) => sum + e.amountKobo, 0);
  const averageKobo = rows.length > 0 ? Math.round(totalKobo / rows.length) : 0;
  const topCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of rows) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amountKobo);
    }
    let best: { name: string; amountKobo: number } | null = null;
    for (const [name, amountKobo] of totals) {
      if (!best || amountKobo > best.amountKobo) best = { name, amountKobo };
    }
    return best;
  }, [rows]);

  const categoryOptions = useMemo(
    () => [...new Set<string>([...EXPENSE_CATEGORIES, ...items.map((e) => e.category)])],
    [items]
  );

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['accounting-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
    ]);
  };

  function openCreate(): void {
    setEditing(null);
    setValues(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(expense: ExpenseRow): void {
    setEditing(expense);
    setValues({
      category: expense.category,
      note: expense.note,
      amount: (expense.amountKobo / 100).toFixed(2),
      paidAt: dateInput(new Date(expense.paidAt)),
    });
    setFormError(null);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amountKobo = parseNairaToKobo(values.amount.trim());
      if (amountKobo === null || amountKobo <= 0) throw new Error('Enter an amount like 25000.00');
      const paidAt = new Date(`${values.paidAt}T12:00:00`);
      if (Number.isNaN(paidAt.getTime())) throw new Error('Choose the date it was paid');
      const input = {
        category: values.category,
        note: values.note.trim(),
        amountKobo,
        paidAt: paidAt.toISOString(),
      };
      const res = editing
        ? await ipc.expenseUpdate(editing.id, input)
        : await ipc.expenseCreate(input);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the expense');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setEditing(null);
      setValues(emptyForm());
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

  function presetMonth(offset: number): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    setFrom(dateInput(start));
    setTo(dateInput(end));
  }

  function presetYear(): void {
    const now = new Date();
    setFrom(dateInput(new Date(now.getFullYear(), 0, 1)));
    setTo(dateInput(now));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Running costs such as rent, salaries and transport, with totals and export.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() =>
              downloadFile(`analytiq-expenses-${from}-to-${to}.csv`, buildCsv(rows, from, to))
            }
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={openCreate}>
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
            <Button size="sm" variant="secondary" onClick={presetYear}>
              This year
            </Button>
          </div>
          <Input
            label="From"
            name="expense-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            label="To"
            name="expense-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <div className="w-full sm:w-44">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Category
            </label>
            <select
              aria-label="Filter by category"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-56">
            <Input
              label="Search"
              name="expense-search"
              placeholder="Note or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {!validRange ? <ErrorState message="The start date must be before the end date." /> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {expensesQuery.isLoading ? <LoadingState label="Loading expenses…" /> : null}
      {expensesQuery.isError ? (
        <ErrorState
          message={(expensesQuery.error as Error).message}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : null}

      {!expensesQuery.isLoading && !expensesQuery.isError ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Wallet}
              label="Total spent"
              value={formatKobo(totalKobo)}
              sub={`${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`}
              tone="violet"
            />
            <Stat
              icon={Receipt}
              label="Expenses recorded"
              value={String(rows.length)}
              sub="in this selection"
              tone="sky"
            />
            <Stat
              icon={Calculator}
              label="Average per entry"
              value={formatKobo(averageKobo)}
              sub="across the selection"
              tone="amber"
            />
            <Stat
              icon={BarChart3}
              label="Biggest category"
              value={topCategory ? topCategory.name : '—'}
              sub={topCategory ? formatKobo(topCategory.amountKobo) : 'Nothing recorded'}
              tone="emerald"
            />
          </div>

          <Card>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  {items.length === 0
                    ? 'No expenses recorded in this period.'
                    : 'No expenses match the category and search filters.'}
                </p>
              ) : (
                <Table>
                  <THead>
                    <TRow>
                      <TH>Date</TH>
                      <TH>Category</TH>
                      <TH>Note</TH>
                      <TH>Recorded by</TH>
                      <TH className="text-right">Amount</TH>
                      <TH className="text-right">Actions</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {rows.map((expense) => (
                      <TRow key={expense.id}>
                        <TD>{new Date(expense.paidAt).toLocaleDateString()}</TD>
                        <TD>
                          <Badge>{expense.category}</Badge>
                        </TD>
                        <TD className="max-w-[240px] truncate text-slate-500">
                          {expense.note || '—'}
                        </TD>
                        <TD className="text-slate-500">{expense.createdByName || '—'}</TD>
                        <TD className="tabular-nums text-right font-medium">
                          {formatKobo(expense.amountKobo)}
                        </TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${expense.category} expense of ${formatKobo(expense.amountKobo)}`}
                              onClick={() => openEdit(expense)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete ${expense.category} expense of ${formatKobo(expense.amountKobo)}`}
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
              {items.length >= 500 ? (
                <p className="mt-3 text-xs text-slate-500">
                  Showing the latest 500 entries. Narrow the dates to see older ones.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit expense' : 'Record an expense'}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Category
            </label>
            <select
              aria-label="Expense category"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.category}
              onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            >
              {EXPENSE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount (₦)"
            name="expense-amount"
            inputMode="decimal"
            placeholder="25000.00"
            value={values.amount}
            onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
          />
          <Input
            label="Paid on"
            name="expense-paid-at"
            type="date"
            value={values.paidAt}
            onChange={(e) => setValues((v) => ({ ...v, paidAt: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            name="expense-note"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
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
