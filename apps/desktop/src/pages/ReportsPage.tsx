import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Calculator,
  Download,
  Landmark,
  Receipt,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ErrorState, LoadingState } from '../components/ui/states';
import { Stat } from '../components/ui/stat';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import type { ReportsSummary } from '../types/global';

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
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
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

interface ChartBucket {
  key: string;
  label: string;
  grossKobo: number;
  transactions: number;
}

/** Collapse long ranges so the trend stays readable: days → weeks → months. */
function bucketDaily(rows: ReportsSummary['daily']): ChartBucket[] {
  if (rows.length <= 35) {
    return rows.map((r) => ({
      key: r.date,
      label: r.date.slice(5),
      grossKobo: r.grossKobo,
      transactions: r.transactions,
    }));
  }
  if (rows.length <= 120) {
    const out: ChartBucket[] = [];
    for (let i = 0; i < rows.length; i += 7) {
      const chunk = rows.slice(i, i + 7);
      const first = chunk[0]?.date ?? '';
      out.push({
        key: first,
        label: first.slice(5),
        grossKobo: chunk.reduce((sum, r) => sum + r.grossKobo, 0),
        transactions: chunk.reduce((sum, r) => sum + r.transactions, 0),
      });
    }
    return out;
  }
  const byMonth = new Map<string, ChartBucket>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) {
      bucket.grossKobo += row.grossKobo;
      bucket.transactions += row.transactions;
    } else {
      byMonth.set(key, {
        key,
        label: key,
        grossKobo: row.grossKobo,
        transactions: row.transactions,
      });
    }
  }
  return [...byMonth.values()];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function naira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

function buildCsv(summary: ReportsSummary, from: string, to: string): string {
  const lines: Array<Array<string | number>> = [
    ['AnalytIQ report'],
    ['From', from],
    ['To', to],
    [],
    ['Metric', 'Value'],
    ['Gross sales (NGN)', naira(summary.sales.grossKobo)],
    ['Net of tax (NGN)', naira(summary.sales.netKobo)],
    ['Tax collected (NGN)', naira(summary.sales.taxKobo)],
    ['Discounts (NGN)', naira(summary.sales.discountKobo)],
    ['Cost of goods sold (NGN)', naira(summary.sales.cogsKobo)],
    ['Gross profit (NGN)', naira(summary.sales.grossProfitKobo)],
    ['Transactions', summary.sales.transactions],
    ['Average basket (NGN)', naira(summary.sales.averageBasketKobo)],
    ['Refunded sales', summary.sales.refundCount],
    ['Refunded amount (NGN)', naira(summary.sales.refundsKobo)],
    ['Voided sales', summary.sales.voidCount],
    [],
    ['Payment method', 'Count', 'Amount (NGN)'],
    ...summary.payments.map((p) => [p.method, p.count, naira(p.amountKobo)]),
    [],
    ['Date', 'Transactions', 'Gross (NGN)', 'Tax (NGN)'],
    ...summary.daily.map((d) => [d.date, d.transactions, naira(d.grossKobo), naira(d.taxKobo)]),
    [],
    ['Top product', 'Qty sold', 'Revenue (NGN)', 'Profit (NGN)'],
    ...summary.topProducts.map((p) => [p.name, p.qty, naira(p.revenueKobo), naira(p.profitKobo)]),
    [],
    ['Top customer', 'Transactions', 'Spend (NGN)'],
    ...summary.topCustomers.map((c) => [c.name, c.transactions, naira(c.totalKobo)]),
    [],
    ['Cashier', 'Transactions', 'Sales (NGN)'],
    ...summary.cashiers.map((c) => [c.name, c.transactions, naira(c.totalKobo)]),
    [],
    ['Stock value at cost (NGN)', naira(summary.inventory.costValueKobo)],
    ['Stock value at retail (NGN)', naira(summary.inventory.retailValueKobo)],
    ['Products', summary.inventory.productCount],
    ['Low stock products', summary.inventory.lowStockCount],
    ['Purchases received', summary.purchases.receivedCount],
    ['Purchases value (NGN)', naira(summary.purchases.receivedKobo)],
    ['Credit outstanding (NGN)', naira(summary.credit.outstandingKobo)],
    ['Credit customers', summary.credit.activeCustomers],
  ];
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
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

export function ReportsPage(): JSX.Element {
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
    queryKey: ['reports-summary', fromIso, toIso],
    enabled: validRange,
    queryFn: async () => {
      const res = await ipc.reportsSummary({ from: fromIso, to: toIso });
      if (!res.ok || !res.summary) throw new Error(res.error ?? 'Could not load reports');
      return res.summary;
    },
  });

  const summary = summaryQuery.data;
  const buckets = useMemo(() => (summary ? bucketDaily(summary.daily) : []), [summary]);
  const peak = buckets.reduce((max, b) => Math.max(max, b.grossKobo), 0);
  const paymentTotal = (summary?.payments ?? []).reduce((sum, p) => sum + p.amountKobo, 0);

  const rangeLabel = `${range.from.toLocaleDateString()} — ${range.to.toLocaleDateString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sales, profit, stock and credit — calculated live from your ledger.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!summary}
          onClick={() => {
            if (!summary) return;
            const csv = buildCsv(
              summary,
              range.from.toLocaleDateString(),
              range.to.toLocaleDateString()
            );
            downloadFile(`analytiq-report-${dateInput(fromIso)}.csv`, csv);
          }}
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

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
      {summaryQuery.isLoading ? <LoadingState label="Crunching your numbers…" /> : null}
      {summaryQuery.isError ? (
        <ErrorState
          message={(summaryQuery.error as Error).message}
          onRetry={() => void summaryQuery.refetch()}
        />
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Banknote}
              label="Gross sales"
              value={formatKobo(summary.sales.grossKobo)}
              sub={`${summary.sales.transactions} transaction${summary.sales.transactions === 1 ? '' : 's'}`}
              tone="emerald"
            />
            <Stat
              icon={TrendingUp}
              label="Gross profit"
              value={formatKobo(summary.sales.grossProfitKobo)}
              sub={`COGS ${formatKobo(summary.sales.cogsKobo)}`}
              tone="brand"
            />
            <Stat
              icon={Receipt}
              label="Tax collected"
              value={formatKobo(summary.sales.taxKobo)}
              sub={`Net ${formatKobo(summary.sales.netKobo)}`}
              tone="sky"
            />
            <Stat
              icon={Calculator}
              label="Average basket"
              value={formatKobo(summary.sales.averageBasketKobo)}
              sub={`${summary.sales.refundCount} refunds · ${summary.sales.voidCount} voids`}
              tone="violet"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Warehouse}
              label="Stock at cost"
              value={formatKobo(summary.inventory.costValueKobo)}
              sub={`${summary.inventory.productCount} products`}
              tone="brand"
            />
            <Stat
              icon={Warehouse}
              label="Stock at retail"
              value={formatKobo(summary.inventory.retailValueKobo)}
              sub="potential revenue"
              tone="sky"
            />
            <Stat
              icon={AlertTriangle}
              label="Low stock"
              value={String(summary.inventory.lowStockCount)}
              sub="at or below reorder level"
              tone="amber"
            />
            <Stat
              icon={Landmark}
              label="Credit outstanding"
              value={formatKobo(summary.credit.outstandingKobo)}
              sub={`${summary.credit.activeCustomers} active customers`}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Sales trend</CardTitle>
              </CardHeader>
              <CardContent>
                {buckets.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">
                    No sales in this period.
                  </p>
                ) : (
                  <div>
                    <div className="flex h-44 items-end gap-1">
                      {buckets.map((bucket) => {
                        const height = peak > 0 ? Math.max(2, (bucket.grossKobo / peak) * 100) : 2;
                        return (
                          <div
                            key={bucket.key}
                            className="group relative flex flex-1 flex-col items-center justify-end"
                            title={`${bucket.label}: ${formatKobo(bucket.grossKobo)} · ${bucket.transactions} sales`}
                          >
                            <div
                              className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-500 dark:bg-brand-400/70 dark:group-hover:bg-brand-400"
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                      <span>{buckets[0]?.label}</span>
                      <span>{buckets[buckets.length - 1]?.label}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment mix</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.payments.length === 0 ? (
                  <p className="py-6 text-sm text-slate-500">No payments in this period.</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.payments.map((p) => {
                      const share =
                        paymentTotal > 0 ? Math.round((p.amountKobo / paymentTotal) * 100) : 0;
                      return (
                        <li key={p.method}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize text-slate-600 dark:text-slate-300">
                              {p.method}
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatKobo(p.amountKobo)}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-brand-500"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {p.count} payment{p.count === 1 ? '' : 's'} · {share}%
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Best-selling products</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.topProducts.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">No product sales yet.</p>
                ) : (
                  <Table>
                    <THead>
                      <TRow>
                        <TH>Product</TH>
                        <TH className="text-right">Qty</TH>
                        <TH className="text-right">Revenue</TH>
                        <TH className="text-right">Profit</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {summary.topProducts.map((p) => (
                        <TRow key={p.productId}>
                          <TD className="font-medium">{p.name}</TD>
                          <TD className="tabular-nums text-right">{p.qty}</TD>
                          <TD className="tabular-nums text-right">{formatKobo(p.revenueKobo)}</TD>
                          <TD className="tabular-nums text-right">{formatKobo(p.profitKobo)}</TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top customers</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.topCustomers.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">
                    No sales have been linked to a customer yet.
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TRow>
                        <TH>Customer</TH>
                        <TH className="text-right">Sales</TH>
                        <TH className="text-right">Spend</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {summary.topCustomers.map((c) => (
                        <TRow key={c.customerId ?? c.name}>
                          <TD className="font-medium">{c.name}</TD>
                          <TD className="tabular-nums text-right">{c.transactions}</TD>
                          <TD className="tabular-nums text-right">{formatKobo(c.totalKobo)}</TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sales by cashier</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.cashiers.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">No completed sales yet.</p>
                ) : (
                  <Table>
                    <THead>
                      <TRow>
                        <TH>Cashier</TH>
                        <TH className="text-right">Sales</TH>
                        <TH className="text-right">Value</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {summary.cashiers.map((c) => (
                        <TRow key={c.customerId ?? 'walk-in'}>
                          <TD className="font-medium">{c.name}</TD>
                          <TD className="tabular-nums text-right">{c.transactions}</TD>
                          <TD className="tabular-nums text-right">{formatKobo(c.totalKobo)}</TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Purchasing and credit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Truck className="h-4 w-4" /> Purchases received
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatKobo(summary.purchases.receivedKobo)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {summary.purchases.receivedCount} purchase
                      {summary.purchases.receivedCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Users className="h-4 w-4" /> Credit owed to you
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {formatKobo(summary.credit.outstandingKobo)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {summary.credit.activeCustomers} active customer
                      {summary.credit.activeCustomers === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Receipt className="h-4 w-4" /> Refunds and voids
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">
                      {formatKobo(summary.sales.refundsKobo)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {summary.sales.refundCount} refund
                      {summary.sales.refundCount === 1 ? '' : 's'} · {summary.sales.voidCount} void
                      {summary.sales.voidCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Subtotal {formatKobo(summary.sales.subtotalKobo)}
                  </Badge>
                  <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Discounts {formatKobo(summary.sales.discountKobo)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
