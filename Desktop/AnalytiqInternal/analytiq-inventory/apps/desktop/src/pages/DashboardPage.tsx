import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Banknote, Package, Plus, ShoppingCart, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Stat } from '../components/ui/stat';
import { EmptyState, LoadingState } from '../components/ui/states';
import { useSession } from '../stores/session';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';

function startOfTodayIso(): string {
 const d = new Date();
 d.setHours(0, 0, 0, 0);
 return d.toISOString();
}

export function DashboardPage(): JSX.Element {
 const user = useSession((s) => s.user);
 const can = useSession((s) => s.can);
 const hour = new Date().getHours();
 const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

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

 const loading = salesQuery.isLoading || levelsQuery.isLoading || productsQuery.isLoading;

 const todaySales = (salesQuery.data?.items ?? []).filter(
 (s) => s.status === 'completed' && s.createdAt >= startOfTodayIso(),
 );
 const todayTotal = todaySales.reduce((sum, s) => sum + s.totalKobo, 0);
 const lowStock = levelsQuery.data?.items ?? [];

 if (loading) return <LoadingState label="Loading your business at a glance…" />;

 return (
 <div className="space-y-6">
 {/* Greeting */}
 <div className="flex flex-wrap items-end justify-between gap-3">
 <div>
 <h1 className="text-2xl font-bold tracking-tight">
 {greeting}{user ? `, ${user.name.split(' ')[0]}` : ''} 👋
 </h1>
 <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening in your store today.</p>
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

 {/* Stat tiles */}
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
 <Stat icon={Warehouse} label="Outstanding credit" value={formatKobo(0)} sub="customers arrive in Batch 6" tone="sky" />
 </div>

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 {/* Quick actions */}
 <Card className="shadow-card">
 <CardHeader>
 <CardTitle className="text-base">Quick actions</CardTitle>
 </CardHeader>
 <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
 </CardContent>
 </Card>

 {/* Low stock */}
 <Card className="shadow-card">
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="text-base">Needs restocking</CardTitle>
 {can('inventory.view') ? (
 <Link to="/inventory" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-500">
 View all <ArrowRight className="h-3.5 w-3.5" />
 </Link>
 ) : null}
 </div>
 </CardHeader>
 <CardContent>
 {lowStock.length === 0 ? (
 <EmptyState title="Stock levels look healthy" hint="Products running low will show up here." />
 ) : (
 <ul className="divide-y divide-slate-100 dark:divide-slate-800">
 {lowStock.slice(0, 5).map((l) => (
 <li key={`${l.productId}-${l.locationId}`} className="flex items-center justify-between gap-2 py-2">
 <div className="min-w-0">
 <p className="truncate text-sm font-medium">{l.productName}</p>
 <p className="text-xs text-slate-500">{l.locationName}</p>
 </div>
 <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
 {l.onHand} left
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
