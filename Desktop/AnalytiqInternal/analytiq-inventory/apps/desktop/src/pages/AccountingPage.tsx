import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator,
  Download,
  Landmark,
  PackageSearch,
  Receipt,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ErrorState, LoadingState } from '../components/ui/states';
import { Stat } from '../components/ui/stat';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import {
  buildProductSalesCsv,
  buildProductSalesStatement,
  buildProfitAndLoss,
  buildProfitAndLossCsv,
  percentOf,
} from '../lib/statements';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'pnl', label: 'Profit & loss' },
  { key: 'products', label: 'Product sales' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
] as const;

type PresetKey = (typeof PRESETS)[number]['key'];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function dateInput(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function presetRange(preset: PresetKey): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case '7d':
      return { from: startOfDay(new Date(now.getTime() - 6 * 86_400_000)), to: endOfDay(now) };
    case '30d':
      return { from: startOfDay(new Date(now.getTime() - 29 * 86_400_000)), to: endOfDay(now) };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'lastMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
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

function AmountRow({
  label,
  amountKobo,
  total,
  negative,
  muted,
}: {
  label: string;
  amountKobo: number;
  total?: boolean;
  negative?: boolean;
  muted?: boolean;
}): JSX.Element {
  return (
    <TRow className={total ? 'bg-slate-50 dark:bg-slate-800/40 font-semibold' : undefined}>
      <TD className={muted ? 'text-slate-500 dark:text-slate-400' : undefined}>{label}</TD>
      <TD
        className={`text-right tabular-nums ${muted ? 'text-slate-500 dark:text-slate-400' : ''}`}
      >
        {negative ? '− ' : ''}
        {formatKobo(amountKobo)}
      </TD>
    </TRow>
  );
}

function SectionRow({ label }: { label: string }): JSX.Element {
  return (
    <TRow className="bg-slate-50/80 dark:bg-slate-800/30">
      <TD colSpan={2} className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </TD>
    </TRow>
  );
}

export function AccountingPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('overview');
  const [preset, setPreset] = useState<PresetKey>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [customFrom, setCustomFrom] = useState(() => dateInput(new Date().toISOString()));
  const [customTo, setCustomTo] = useState(() => dateInput(new Date().toISOString()));

  function choosePreset(next: PresetKey): void {
    setPreset(next);
    if (next !== 'custom') {
      setRange(presetRange(next));
    } else {
      const from = startOfDay(new Date(`${customFrom}T00:00:00`));
      const to = endOfDay(new Date(`${customTo}T00:00:00`));
      setRange({ from, to });
    }
  }

  function applyCustom(fromValue: string, toValue: string): void {
    setCustomFrom(fromValue);
    setCustomTo(toValue);
    if (preset !== 'custom') return;
    const from = startOfDay(
      new Date(`${fromValue || dateInput(new Date().toISOString())}T00:00:00`)
    );
    const to = endOfDay(new Date(`${toValue || dateInput(new Date().toISOString())}T00:00:00`));
    setRange({ from, to });
  }

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const validRange = range.from.getTime() <= range.to.getTime();

  const summaryQuery = useQuery({
    queryKey: ['accounting-summary', fromIso, toIso],
    enabled: validRange,
    queryFn: async () => {
      const res = await ipc.reportsSummary({ from: fromIso, to: toIso });
      if (!res.ok || !res.summary) throw new Error(res.error ?? 'Could not load accounting data');
      return res.summary;
    },
  });

  const summary = summaryQuery.data;
  const statement = useMemo(() => (summary ? buildProfitAndLoss(summary) : null), [summary]);
  const productStatement = useMemo(
    () => (summary ? buildProductSalesStatement(summary) : null),
    [summary]
  );

  const rangeLabel = `${range.from.toLocaleDateString()} — ${range.to.toLocaleDateString()}`;

  function exportCsv(): void {
    if (!statement || !productStatement) return;
    if (tab === 'products') {
      downloadFile(
        `analytiq-product-sales-${dateInput(fromIso)}.csv`,
        buildProductSalesCsv(productStatement)
      );
      return;
    }
    downloadFile(
      `analytiq-profit-and-loss-${dateInput(fromIso)}.csv`,
      buildProfitAndLossCsv(statement)
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Profit and loss and product sales statements for any period.
          </p>
        </div>
        <Button variant="secondary" disabled={!summary} onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-1">
          {TABS.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={tab === item.key ? 'primary' : 'secondary'}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={preset === item.key ? 'primary' : 'secondary'}
                onClick={() => choosePreset(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          {preset === 'custom' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="From"
                type="date"
                value={customFrom}
                onChange={(e) => applyCustom(e.target.value, customTo)}
              />
              <Input
                label="To"
                type="date"
                value={customTo}
                onChange={(e) => applyCustom(customFrom, e.target.value)}
              />
            </div>
          ) : (
            <span className="pb-2 text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</span>
          )}
        </CardContent>
      </Card>

      {!validRange ? <ErrorState message="The start date must be before the end date." /> : null}
      {summaryQuery.isLoading ? <LoadingState label="Preparing your statements…" /> : null}
      {summaryQuery.isError ? (
        <ErrorState
          message={(summaryQuery.error as Error).message}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : null}

      {statement && productStatement ? (
        <>
          {tab === 'overview' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  icon={Landmark}
                  label="Net sales"
                  value={formatKobo(statement.income.netSalesKobo)}
                  sub={`${statement.income.taxKobo > 0 ? `excludes ${formatKobo(statement.income.taxKobo)} tax` : 'tax excluded'}`}
                  tone="emerald"
                />
                <Stat
                  icon={TrendingUp}
                  label="Gross profit"
                  value={formatKobo(statement.grossProfitKobo)}
                  sub={`${statement.grossMarginPct}% of net sales`}
                  tone="brand"
                />
                <Stat
                  icon={Receipt}
                  label="Operating expenses"
                  value={formatKobo(statement.expensesKobo)}
                  sub={`${summary?.expenses.count ?? 0} recorded`}
                  tone="violet"
                />
                <Stat
                  icon={Wallet}
                  label="Net profit"
                  value={formatKobo(statement.netProfitKobo)}
                  sub={`${statement.netMarginPct}% of net sales`}
                  tone={statement.netProfitKobo >= 0 ? 'emerald' : 'amber'}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Statement summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <THead>
                        <TRow>
                          <TH>Line</TH>
                          <TH className="text-right">Amount</TH>
                        </TRow>
                      </THead>
                      <tbody>
                        <AmountRow
                          label="Net sales (tax excluded)"
                          amountKobo={statement.income.netSalesKobo}
                        />
                        <AmountRow
                          label="Cost of goods sold"
                          amountKobo={statement.cogsKobo}
                          negative
                        />
                        <AmountRow
                          label="Gross profit"
                          amountKobo={statement.grossProfitKobo}
                          total
                        />
                        <AmountRow
                          label="Operating expenses"
                          amountKobo={statement.expensesKobo}
                          negative
                        />
                        <AmountRow label="Net profit" amountKobo={statement.netProfitKobo} total />
                        <AmountRow
                          label="Sales tax collected"
                          amountKobo={statement.income.taxKobo}
                          muted
                        />
                        <AmountRow
                          label="Total collected"
                          amountKobo={statement.income.totalCollectedKobo}
                          muted
                        />
                      </tbody>
                    </Table>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Cost of goods sold uses each product&apos;s current cost price.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Expenses by category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {statement.expenses.length === 0 ? (
                      <p className="py-6 text-sm text-slate-500">
                        No expenses recorded in this period.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {statement.expenses.map((expense) => {
                          const share = percentOf(expense.amountKobo, statement.expensesKobo);
                          return (
                            <li key={expense.category}>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-600 dark:text-slate-300">
                                  {expense.category}
                                </span>
                                <span className="tabular-nums font-medium">
                                  {formatKobo(expense.amountKobo)}
                                </span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: `${share}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {share}% of expenses
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

          {tab === 'pnl' ? (
            <Card>
              <CardHeader>
                <CardTitle>Profit and loss statement</CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {range.from.toLocaleDateString()} — {range.to.toLocaleDateString()} · amounts in
                  naira
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead>
                    <TRow>
                      <TH>Line</TH>
                      <TH className="text-right">Amount (NGN)</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    <SectionRow label="Income" />
                    <AmountRow
                      label="Sales before discounts"
                      amountKobo={statement.income.salesBeforeDiscountsKobo}
                    />
                    <AmountRow
                      label="Less: discounts"
                      amountKobo={statement.income.discountsKobo}
                      negative
                    />
                    <AmountRow
                      label="Less: loyalty points redeemed"
                      amountKobo={statement.income.loyaltyKobo}
                      negative
                    />
                    <AmountRow
                      label="Net sales (tax excluded)"
                      amountKobo={statement.income.netSalesKobo}
                      total
                    />
                    <AmountRow
                      label="Sales tax collected (not income)"
                      amountKobo={statement.income.taxKobo}
                      muted
                    />
                    <AmountRow
                      label="Total collected from customers"
                      amountKobo={statement.income.totalCollectedKobo}
                      muted
                    />

                    <SectionRow label="Cost of sales" />
                    <AmountRow
                      label="Cost of goods sold"
                      amountKobo={statement.cogsKobo}
                      negative
                    />
                    <AmountRow label="Gross profit" amountKobo={statement.grossProfitKobo} total />
                    <TRow>
                      <TD className="text-slate-500 dark:text-slate-400">Gross margin</TD>
                      <TD className="text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {statement.grossMarginPct}%
                      </TD>
                    </TRow>

                    <SectionRow label="Operating expenses" />
                    {statement.expenses.length === 0 ? (
                      <TRow>
                        <TD className="text-slate-500" colSpan={2}>
                          No expenses recorded in this period.
                        </TD>
                      </TRow>
                    ) : (
                      statement.expenses.map((expense) => (
                        <AmountRow
                          key={expense.category}
                          label={expense.category}
                          amountKobo={expense.amountKobo}
                        />
                      ))
                    )}
                    <AmountRow
                      label="Total operating expenses"
                      amountKobo={statement.expensesKobo}
                      total
                    />

                    <SectionRow label="Result" />
                    <AmountRow
                      label={`Net profit (${statement.netMarginPct}% of net sales)`}
                      amountKobo={statement.netProfitKobo}
                      total
                    />

                    <SectionRow label="Memo" />
                    <TRow>
                      <TD>Transactions</TD>
                      <TD className="text-right tabular-nums">{statement.memo.transactions}</TD>
                    </TRow>
                    <AmountRow
                      label="Average basket"
                      amountKobo={statement.memo.averageBasketKobo}
                      muted
                    />
                    <TRow>
                      <TD>Refunds</TD>
                      <TD className="text-right tabular-nums">{statement.memo.refundCount}</TD>
                    </TRow>
                    <AmountRow
                      label="Refunded amount"
                      amountKobo={statement.memo.refundsKobo}
                      muted
                      negative
                    />
                    <TRow>
                      <TD>Voided sales</TD>
                      <TD className="text-right tabular-nums">{statement.memo.voidCount}</TD>
                    </TRow>
                  </tbody>
                </Table>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Net sales subtract line and header discounts plus loyalty redemptions from the
                  list subtotal. Cost of goods sold uses each product&apos;s current cost price.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'products' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  icon={PackageSearch}
                  label="Products sold"
                  value={String(productStatement.totals.products)}
                  sub={`${productStatement.unsoldCount} active without sales`}
                  tone="brand"
                />
                <Stat
                  icon={Calculator}
                  label="Units sold"
                  value={String(productStatement.totals.qty)}
                  sub="all products in period"
                  tone="violet"
                />
                <Stat
                  icon={TrendingUp}
                  label="Product revenue"
                  value={formatKobo(productStatement.totals.revenueKobo)}
                  sub={`${productStatement.totals.marginPct}% product margin`}
                  tone="emerald"
                />
                <Stat
                  icon={Wallet}
                  label="Product profit"
                  value={formatKobo(productStatement.totals.profitKobo)}
                  sub={`COGS ${formatKobo(productStatement.totals.cogsKobo)}`}
                  tone="brand"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Product sales statement</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {range.from.toLocaleDateString()} — {range.to.toLocaleDateString()} · ranked by
                    revenue
                  </p>
                </CardHeader>
                <CardContent>
                  {productStatement.rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      No products were sold in this period.
                    </p>
                  ) : (
                    <>
                      <Table>
                        <THead>
                          <TRow>
                            <TH>Product</TH>
                            <TH>SKU</TH>
                            <TH className="text-right">Qty</TH>
                            <TH className="text-right">Revenue</TH>
                            <TH className="text-right">COGS</TH>
                            <TH className="text-right">Profit</TH>
                            <TH className="text-right">Margin</TH>
                            <TH className="text-right">Share</TH>
                          </TRow>
                        </THead>
                        <tbody>
                          {productStatement.rows.map((row) => (
                            <TRow key={row.productId}>
                              <TD className="font-medium">{row.name}</TD>
                              <TD className="text-slate-500">{row.sku || '—'}</TD>
                              <TD className="text-right tabular-nums">{row.qty}</TD>
                              <TD className="text-right tabular-nums">
                                {formatKobo(row.revenueKobo)}
                              </TD>
                              <TD className="text-right tabular-nums">
                                {formatKobo(row.cogsKobo)}
                              </TD>
                              <TD className="text-right tabular-nums">
                                {formatKobo(row.profitKobo)}
                              </TD>
                              <TD className="text-right tabular-nums">{row.marginPct}%</TD>
                              <TD className="text-right tabular-nums">{row.sharePct}%</TD>
                            </TRow>
                          ))}
                          <TRow className="bg-slate-50 font-semibold dark:bg-slate-800/40">
                            <TD>Total</TD>
                            <TD />
                            <TD className="text-right tabular-nums">
                              {productStatement.totals.qty}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {formatKobo(productStatement.totals.revenueKobo)}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {formatKobo(productStatement.totals.cogsKobo)}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {formatKobo(productStatement.totals.profitKobo)}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {productStatement.totals.marginPct}%
                            </TD>
                            <TD className="text-right tabular-nums">100%</TD>
                          </TRow>
                        </tbody>
                      </Table>
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        Product revenue is the line subtotal after line discounts, before sales tax.
                        COGS uses each product&apos;s current cost price.
                        {productStatement.unsoldCount > 0
                          ? ` ${productStatement.unsoldCount} active product${
                              productStatement.unsoldCount === 1 ? '' : 's'
                            } had no sales in this period.`
                          : ''}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
