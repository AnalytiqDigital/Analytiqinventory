import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Calculator,
  CreditCard,
  Landmark,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Stat } from '../components/ui/stat';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { useSession } from '../stores/session';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import { percentOf } from '../lib/statements';
import type { BatchRow, ReportsSummary } from '../types/global';

function startOfTodayIso(from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function useSummary(period: 'today' | 'month', from: string, to: string) {
  return useQuery({
    queryKey: ['dashboard-summary', period, from, to],
    // The window is frozen for this mount; refetches must reuse the same key.
    staleTime: 30_000,
    retry: 1,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ReportsSummary> => {
      const res = await ipc.reportsSummary({ from, to, topLimit: 5 });
      if (!res.ok || !res.summary) throw new Error(res.error ?? 'Could not load analytics');
      return res.summary;
    },
  });
}

function DashboardHeading(): JSX.Element {
  const user = useSession((s) => s.user);
  const can = useSession((s) => s.can);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}
          {user ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Live sales, profit and stock for your business.
        </p>
      </div>
      {can('sales.create') ? (
        <Link to="/pos">
          <Button size="lg">
            <ShoppingCart className="h-5 w-5" />
            New sale
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

function QuickActions({ showAccounting }: { showAccounting: boolean }): JSX.Element {
  const can = useSession((s) => s.can);
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {can('sales.create') ? (
          <Link to="/pos">
            <Button variant="secondary" className="w-full">
              <ShoppingCart className="h-4 w-4" />
              Sell
            </Button>
          </Link>
        ) : null}
        {can('products.manage') ? (
          <Link to="/products">
            <Button variant="secondary" className="w-full">
              <Plus className="h-4 w-4" />
              Add product
            </Button>
          </Link>
        ) : null}
        {can('inventory.view') ? (
          <Link to="/inventory">
            <Button variant="secondary" className="w-full">
              <Warehouse className="h-4 w-4" />
              Check stock
            </Button>
          </Link>
        ) : null}
        {showAccounting ? (
          <Link to="/accounting">
            <Button variant="secondary" className="w-full">
              <Calculator className="h-4 w-4" />
              Statements
            </Button>
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RestockCard({ summary }: { summary: ReportsSummary }): JSX.Element {
  const can = useSession((s) => s.can);
  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Needs restocking</CardTitle>
          {can('inventory.view') ? (
            <Link
              to="/inventory"
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {summary.stockAlerts.length === 0 ? (
          <EmptyState
            title="Stock levels look healthy"
            hint="Products running low will show up here."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {summary.stockAlerts.slice(0, 5).map((alert) => (
              <li key={alert.productId} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{alert.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Order {alert.suggestedOrder} · {formatKobo(alert.costValueKobo)} at cost
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  {alert.onHand} left
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const expiry = new Date(value).getTime();
  if (Number.isNaN(expiry)) return null;
  return Math.ceil((expiry - Date.now()) / 86_400_000);
}

function ExpiryCard({ items }: { items: BatchRow[] }): JSX.Element {
  const can = useSession((s) => s.can);
  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Expiring soon</CardTitle>
          {can('inventory.view') ? (
            <Link
              to="/batches?expiry=30"
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="No expiry alerts"
            hint="Batches nearing their expiry date will show up here once products carry pack dates."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.slice(0, 5).map((batch) => {
              const days = daysUntil(batch.expiryDate);
              const expired = batch.status === 'expired';
              return (
                <li key={batch.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{batch.productName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {[
                        batch.batchNo || null,
                        `${batch.remaining} ${batch.unit}`,
                        batch.locationName || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                      expired
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}
                  >
                    {expired
                      ? 'Expired'
                      : days == null
                        ? 'Soon'
                        : days <= 0
                          ? 'Today'
                          : `${days}d left`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <DashboardHeading />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="mt-4 h-7 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <LoadingState label="Loading your analytics…" />
    </div>
  );
}

function AnalyticsDashboard(): JSX.Element {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const nowIso = useMemo(() => now.toISOString(), [now]);
  const todayFrom = useMemo(() => startOfTodayIso(now), [now]);
  const monthFrom = startOfMonthIso(now);

  const todayQuery = useSummary('today', todayFrom, nowIso);
  const monthQuery = useSummary('month', monthFrom, nowIso);

  // Expiry counts down on its own, so this refreshes with the rest of the page
  // rather than going stale behind a cached reports payload.
  const expiryQuery = useQuery({
    queryKey: ['dashboard-expiry-alerts'],
    refetchInterval: 300_000,
    queryFn: async (): Promise<BatchRow[]> => {
      const res = await ipc.expiryAlerts(30);
      if (!res.ok) throw new Error(res.error ?? 'Could not load expiry alerts');
      return res.items ?? [];
    },
  });

  const loading = todayQuery.isLoading || monthQuery.isLoading;
  const error = (todayQuery.error as Error | null) ?? (monthQuery.error as Error | null);

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return (
      <div className="space-y-6">
        <DashboardHeading />
        <ErrorState
          message={error.message}
          onRetry={() => {
            void todayQuery.refetch();
            void monthQuery.refetch();
          }}
        />
      </div>
    );
  }

  const today = todayQuery.data;
  const month = monthQuery.data;
  if (!today || !month) return <DashboardSkeleton />;

  const trend = [...month.daily].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const trendPeak = trend.reduce((max, day) => Math.max(max, day.grossKobo), 0);

  const paymentTotal = month.payments.reduce((sum, p) => sum + p.amountKobo, 0);
  const cashToday = today.payments
    .filter((p) => p.method !== 'credit')
    .reduce((sum, p) => sum + p.amountKobo, 0);
  const cashCount = today.payments
    .filter((p) => p.method !== 'credit')
    .reduce((sum, p) => sum + p.count, 0);

  const grossMarginPct = percentOf(month.sales.grossProfitKobo, month.sales.netKobo);
  const netMarginPct = percentOf(month.finance.netProfitKobo, month.sales.netKobo);
  const monthLabel = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="space-y-6">
      <DashboardHeading />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Banknote}
          label="Today's sales"
          value={formatKobo(today.sales.grossKobo)}
          sub={`${today.sales.transactions} transaction${today.sales.transactions === 1 ? '' : 's'} · ${formatKobo(today.sales.averageBasketKobo)} avg basket`}
          tone="emerald"
        />
        <Stat
          icon={TrendingUp}
          label="Gross profit (month)"
          value={formatKobo(month.sales.grossProfitKobo)}
          sub={`${grossMarginPct}% margin · net sales ${formatKobo(month.sales.netKobo)}`}
          tone="brand"
        />
        <Stat
          icon={Wallet}
          label="Net profit (month)"
          value={formatKobo(month.finance.netProfitKobo)}
          sub={`${netMarginPct}% margin · ${formatKobo(month.expenses.totalKobo)} expenses`}
          tone={month.finance.netProfitKobo >= 0 ? 'emerald' : 'amber'}
          onClick={() => navigate('/accounting')}
        />
        <Stat
          icon={Landmark}
          label="Outstanding credit"
          value={formatKobo(month.credit.outstandingKobo)}
          sub={`${month.credit.activeCustomers} customer${month.credit.activeCustomers === 1 ? '' : 's'} owing`}
          tone="sky"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={CreditCard}
          label="Cash & transfer today"
          value={formatKobo(cashToday)}
          sub={`${cashCount} payment${cashCount === 1 ? '' : 's'} excluding credit`}
          tone="emerald"
        />
        <Stat
          icon={Calculator}
          label="Average basket (month)"
          value={formatKobo(month.sales.averageBasketKobo)}
          sub={`${month.sales.transactions} sale${month.sales.transactions === 1 ? '' : 's'} since ${monthLabel}`}
          tone="violet"
        />
        <Stat
          icon={AlertTriangle}
          label="Low stock alerts"
          value={String(month.inventory.lowStockCount)}
          sub={`${month.inventory.productCount} active products`}
          tone="amber"
        />
        <Stat
          icon={Warehouse}
          label="Stock at cost"
          value={formatKobo(month.inventory.costValueKobo)}
          sub={`${formatKobo(month.inventory.retailValueKobo)} at retail`}
          tone="brand"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Last 7 days</CardTitle>
              <Link
                to="/reports"
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
              >
                Full reports <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No sales yet this month.</p>
            ) : (
              <div>
                <div className="flex h-40 items-end gap-1.5">
                  {trend.map((day) => {
                    const height =
                      trendPeak > 0 ? Math.max(2, (day.grossKobo / trendPeak) * 100) : 2;
                    return (
                      <div
                        key={day.date}
                        className="group relative flex flex-1 flex-col items-center justify-end"
                        title={`${day.date}: ${formatKobo(day.grossKobo)} · ${day.transactions} sales`}
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
                  <span>{trend[0]?.date.slice(5)}</span>
                  <span>{trend[trend.length - 1]?.date.slice(5)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Payment mix (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {month.payments.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No payments yet this month.</p>
            ) : (
              <ul className="space-y-3">
                {month.payments.map((payment) => {
                  const share = percentOf(payment.amountKobo, paymentTotal);
                  return (
                    <li key={payment.method}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-slate-600 dark:text-slate-300">
                          {payment.method}
                        </span>
                        <span className="tabular-nums font-medium">
                          {formatKobo(payment.amountKobo)}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {payment.count} payment{payment.count === 1 ? '' : 's'} · {share}%
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Best-selling products</CardTitle>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Top sellers since {monthLabel}, ranked by revenue.
                </p>
              </div>
              <Link
                to="/accounting"
                className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
              >
                Product statement <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {month.topProducts.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">No product sales yet this month.</p>
            ) : (
              <Table>
                <THead>
                  <TRow>
                    <TH>Product</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Revenue</TH>
                    <TH className="text-right">Profit</TH>
                    <TH className="text-right">Margin</TH>
                  </TRow>
                </THead>
                <tbody>
                  {month.topProducts.map((product) => (
                    <TRow key={product.productId}>
                      <TD className="font-medium">{product.name}</TD>
                      <TD className="tabular-nums text-right">{product.qty}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(product.revenueKobo)}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(product.profitKobo)}</TD>
                      <TD className="tabular-nums text-right">
                        {percentOf(product.profitKobo, product.revenueKobo)}%
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <RestockCard summary={month} />
          <ExpiryCard items={expiryQuery.data ?? []} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Sales by cashier (month)</CardTitle>
          </CardHeader>
          <CardContent>
            {month.cashiers.length === 0 ? (
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
                  {month.cashiers.map((cashier) => (
                    <TRow key={cashier.customerId ?? cashier.name}>
                      <TD className="flex items-center gap-2 font-medium">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        {cashier.name}
                      </TD>
                      <TD className="tabular-nums text-right">{cashier.transactions}</TD>
                      <TD className="tabular-nums text-right">{formatKobo(cashier.totalKobo)}</TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base">Profit snapshot (month)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Net sales (tax excluded)</span>
              <span className="font-semibold tabular-nums">{formatKobo(month.sales.netKobo)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Cost of goods sold</span>
              <span className="tabular-nums">− {formatKobo(month.sales.cogsKobo)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="font-medium">Gross profit</span>
              <span className="font-semibold tabular-nums">
                {formatKobo(month.sales.grossProfitKobo)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Operating expenses</span>
              <span className="tabular-nums">− {formatKobo(month.expenses.totalKobo)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="font-medium">Net profit</span>
              <span
                className={`font-bold tabular-nums ${
                  month.finance.netProfitKobo >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatKobo(month.finance.netProfitKobo)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Tax collected</span>
              <span className="tabular-nums">{formatKobo(month.sales.taxKobo)}</span>
            </div>
            <Link
              to="/accounting"
              className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
            >
              Open statement <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <QuickActions showAccounting />
    </div>
  );
}

function BasicDashboard(): JSX.Element {
  const can = useSession((s) => s.can);

  const salesQuery = useQuery({
    queryKey: ['dashboard-sales'],
    queryFn: async () => {
      const res = await ipc.sales({ page: 1, pageSize: 100 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load sales');
      return res as { items: import('../types/global').SaleSummaryRow[]; total: number };
    },
  });

  const levelsQuery = useQuery({
    queryKey: ['dashboard-levels'],
    queryFn: async () => {
      const res = await ipc.stockLevels({ lowOnly: true, page: 1, pageSize: 100 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load stock');
      return res as { items: import('../types/global').StockLevelRow[]; total: number };
    },
  });

  const productsQuery = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: async () => {
      const res = await ipc.products({ page: 1, pageSize: 1 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return res as { items: unknown[]; total: number };
    },
  });

  const creditQuery = useQuery({
    queryKey: ['dashboard-credit'],
    queryFn: async () => {
      const res = await ipc.customers({ limit: 1, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load customer credit');
      return res.outstandingKobo ?? 0;
    },
  });

  const loading =
    salesQuery.isLoading ||
    levelsQuery.isLoading ||
    productsQuery.isLoading ||
    creditQuery.isLoading;

  const todaySales = (salesQuery.data?.items ?? []).filter(
    (sale) => sale.status === 'completed' && sale.createdAt >= startOfTodayIso()
  );
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.totalKobo, 0);
  const lowStock = levelsQuery.data?.items ?? [];

  if (loading) return <LoadingState label="Loading your business at a glance…" />;

  return (
    <div className="space-y-6">
      <DashboardHeading />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Banknote}
          label="Today's sales"
          value={formatKobo(todayTotal)}
          sub={`${todaySales.length} transaction${todaySales.length === 1 ? '' : 's'}`}
          tone="emerald"
        />
        <Stat
          icon={Package}
          label="Products"
          value={String(productsQuery.data?.total ?? 0)}
          sub="in catalogue"
          tone="brand"
        />
        <Stat
          icon={AlertTriangle}
          label="Low stock alerts"
          value={String(lowStock.length)}
          sub={lowStock.length > 0 ? 'needs restocking' : 'all stocked up 🎉'}
          tone="amber"
        />
        <Stat
          icon={Warehouse}
          label="Outstanding credit"
          value={formatKobo(creditQuery.data ?? 0)}
          sub="owed by customers"
          tone="sky"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuickActions showAccounting={false} />

        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Needs restocking</CardTitle>
              {can('inventory.view') ? (
                <Link
                  to="/inventory"
                  className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState
                title="Stock levels look healthy"
                hint="Products running low will show up here."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {lowStock.slice(0, 5).map((level) => (
                  <li
                    key={`${level.productId}-${level.locationId}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{level.productName}</p>
                      <p className="text-xs text-slate-500">{level.locationName}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {level.onHand} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const can = useSession((s) => s.can);
  return can('reports.view') ? <AnalyticsDashboard /> : <BasicDashboard />;
}
