import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  History,
  Landmark,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { ImportDialog } from '../components/ImportDialog';
import { RequirePermission } from '../components/RequirePermission';
import { hasModule } from '../components/layout/nav';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import { printSale } from '../lib/printing';
import { useBarcodeScanner } from '../lib/use-barcode-scanner';
import { cn } from '../lib/cn';
import { ProductThumb } from '../lib/product-media';
import { useSession } from '../stores/session';
import { usePrinter } from '../stores/printer';
import type {
  BusinessProfile,
  CustomerRow,
  DiningTable,
  ProductRow,
  SaleDetail,
  SaleSummaryRow,
  TaxCategory,
} from '../types/global';

type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'credit';

interface CartLine {
  product: ProductRow;
  qty: number;
  unitPriceKobo: number;
  lineDiscountKobo: number;
}

interface TenderPayment {
  method: PaymentMethod;
  amountKobo: number;
  reference: string;
}

const METHOD_META: Record<PaymentMethod, { label: string; short: string; icon: typeof Banknote }> =
  {
    cash: { label: 'Cash', short: 'Cash', icon: Banknote },
    transfer: { label: 'Bank Transfer', short: 'Transfer', icon: Landmark },
    pos: { label: 'POS Terminal', short: 'POS', icon: Smartphone },
    credit: { label: 'Credit (Pay Later)', short: 'Credit', icon: CreditCard },
  };

function newLine(product: ProductRow): CartLine {
  return { product, qty: 1, unitPriceKobo: product.sellingPriceKobo, lineDiscountKobo: 0 };
}

/** Short beep so the cashier hears a scan without looking at the screen. */
function scanBeep(ok: boolean): void {
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1200 : 320;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.22));
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is best-effort; the cart still updates.
  }
}

export function PosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [headerDiscount, setHeaderDiscount] = useState('0.00');
  const [tenderOpen, setTenderOpen] = useState(false);
  const [payments, setPayments] = useState<TenderPayment[]>([
    { method: 'cash', amountKobo: 0, reference: '' },
  ]);
  const [completedSale, setCompletedSale] = useState<SaleDetail | null>(null);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tableId, setTableId] = useState<string>('');
  const [customerId, setCustomerId] = useState<string>('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businessType = useSession((s) => s.user?.businessType);
  const customersEnabled = hasModule(businessType, 'customers');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Pick up global topbar search (?search=...) once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const q = params.get('search');
    if (q) setSearch(q);
    const t = params.get('table');
    if (t) setTableId(t);
  }, []);

  // Keyboard shortcuts: "/" focuses search, F9 opens tender.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        openTender();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart, debounced]);

  const categoriesQuery = useQuery({
    queryKey: ['pos-categories'],
    queryFn: async () => {
      const res = await ipc.categories();
      if (!res.ok) throw new Error(res.error ?? 'Could not load categories');
      return res.items ?? [];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['pos-products', debounced, categoryId],
    queryFn: async () => {
      const res = await ipc.products({
        search: debounced,
        categoryId: categoryId || null,
        includeInactive: false,
        page: 1,
        pageSize: 60,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return res as { items: ProductRow[]; total: number };
    },
  });

  const tablesQuery = useQuery({
    queryKey: ['pos-tables'],
    queryFn: async () => {
      const res = await ipc.tables({});
      if (!res.ok) throw new Error(res.error ?? 'Could not load tables');
      return (res.items ?? []) as DiningTable[];
    },
  });

  // Credit needs someone to owe the money: only load customers when the
  // business has the customers module switched on.
  const customersQuery = useQuery({
    queryKey: ['pos-customers'],
    enabled: customersEnabled,
    queryFn: async () => {
      const res = await ipc.customers({ limit: 200, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load customers');
      return (res.items ?? []) as CustomerRow[];
    },
  });

  const taxQuery = useQuery({
    queryKey: ['tax-categories'],
    queryFn: async () => {
      const res = await ipc.taxCategories();
      if (!res.ok) throw new Error(res.error ?? 'Could not load tax categories');
      return (res.items ?? []) as TaxCategory[];
    },
  });

  const businessQuery = useQuery({
    queryKey: ['business-profile'],
    queryFn: async () => {
      const res = await ipc.businessProfile();
      return res.ok ? ((res.business ?? null) as BusinessProfile | null) : null;
    },
    staleTime: 5 * 60_000,
  });

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.unitPriceKobo * l.qty, 0);
    const lineDiscount = cart.reduce(
      (s, l) => s + Math.min(l.lineDiscountKobo, l.unitPriceKobo * l.qty),
      0
    );
    const headerKobo = parseNairaToKobo(headerDiscount) ?? 0;
    const header = Math.min(headerKobo, Math.max(0, subtotal - lineDiscount));
    // Per-line tax: each line uses its product's tax category rate, falling back to
    // the default category. An extra (header) discount is spread proportionally so
    // the estimate tracks what the service will compute from the same inputs.
    const categories = taxQuery.data ?? [];
    const defaultRateBps = categories.find((c) => c.isDefault)?.rateBps ?? 750;
    const netSubtotal = subtotal - lineDiscount;
    const taxEstimate = cart.reduce((sum, l) => {
      const gross = l.unitPriceKobo * l.qty;
      const net = Math.max(0, gross - Math.min(l.lineDiscountKobo, gross));
      const share = netSubtotal > 0 ? net / netSubtotal : 0;
      const afterHeader = Math.max(0, net - Math.round(header * share));
      const rate =
        categories.find((c) => c.id === l.product.taxCategoryId)?.rateBps ?? defaultRateBps;
      return sum + Math.round((afterHeader * rate) / 10000);
    }, 0);
    const taxable = netSubtotal - header;
    return { subtotal, lineDiscount, header, taxEstimate, total: taxable + taxEstimate };
  }, [cart, headerDiscount, taxQuery.data]);

  const paidTotal = payments.reduce((s, p) => s + p.amountKobo, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  // Credit = the part of the bill the customer will owe on their account.
  const nonCreditPaid = payments
    .filter((p) => p.method !== 'credit')
    .reduce((s, p) => s + p.amountKobo, 0);
  const creditRemaining = Math.max(0, totals.total - nonCreditPaid);

  function addToCart(product: ProductRow): void {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: Math.min(l.qty + 1, 1_000_000) } : l
        );
      }
      return [...prev, newLine(product)];
    });
  }

  async function addScannedCode(code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (!trimmed) return false;
    const res = await ipc.productByBarcode(trimmed);
    if (res.ok && res.product) {
      addToCart(res.product as ProductRow);
      setSearch('');
      scanBeep(true);
      return true;
    }
    scanBeep(false);
    setError(`No active product matches “${trimmed}”`);
    return false;
  }

  // Barcode guns type into whatever has focus. When no field is focused the
  // global listener catches the burst; when the search box is focused its Enter
  // handler (below) performs the same exact-match lookup.
  useBarcodeScanner(
    (code) => {
      void addScannedCode(code);
    },
    completedSale == null && !tenderOpen && !historyOpen
  );

  function updateLine(productId: string, patch: Partial<CartLine>): void {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string): void {
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  }

  const saleMutation = useMutation({
    mutationFn: async () => {
      const res = await ipc.saleCreate({
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          unitPriceKobo: l.unitPriceKobo,
          lineDiscountKobo: l.lineDiscountKobo,
        })),
        headerDiscountKobo: parseNairaToKobo(headerDiscount) ?? 0,
        tableId: tableId === '' ? null : tableId,
        customerId: customerId === '' ? null : customerId,
        payments: payments.map((p) => ({
          method: p.method,
          amountKobo: p.amountKobo,
          reference: p.reference,
        })),
      });
      if (!res.ok) throw new Error(res.error ?? 'Sale failed');
      return res;
    },
    onSuccess: async (res) => {
      setTenderOpen(false);
      setCart([]);
      setTableId('');
      setCustomerId('');
      setHeaderDiscount('0.00');
      setPayments([{ method: 'cash', amountKobo: 0, reference: '' }]);
      setError(null);
      setReceiptNotice(null);
      await queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      await queryClient.invalidateQueries({ queryKey: ['sales-history'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-levels'] });
      await queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
      await queryClient.invalidateQueries({ queryKey: ['tables'] });
      if (res.id) {
        const detail = await ipc.saleGet(res.id);
        if (detail.ok && detail.sale) {
          const sale = detail.sale as SaleDetail;
          setCompletedSale(sale);
          if (usePrinter.getState().autoPrint) {
            const outcome = await printSale(sale, businessQuery.data ?? null);
            if (!outcome.ok) {
              setReceiptNotice(outcome.error ?? 'Could not print the receipt');
            }
          }
        }
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  function openTender(): void {
    if (cart.length === 0) return;
    setPayments([{ method: 'cash', amountKobo: totals.total, reference: '' }]);
    setError(null);
    setTenderOpen(true);
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <RequirePermission permission="sales.create">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Point of Sale</h1>
            <p className="text-sm text-slate-500">
              Tap products to build the cart, then charge.{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold dark:bg-slate-800">
                F9
              </kbd>{' '}
              opens payment.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" />
            Sales history
          </Button>
        </div>

        {/* Table selector: takeaway is the default; picking a table tags the sale
 and occupies it until the sale completes. */}
        {(tablesQuery.data ?? []).length > 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Table
              </span>
              <button
                type="button"
                onClick={() => setTableId('')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                  tableId === ''
                    ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                Takeaway
              </button>
              {(tablesQuery.data ?? []).map((t) => {
                const active = tableId === t.id;
                const busy = t.status === 'occupied' && !active;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTableId(t.id)}
                    title={busy ? `${t.name} is occupied` : `${t.name} · ${t.seats} seats`}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-brand-600 text-white shadow-sm'
                        : busy
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    {t.name}
                    {busy ? ' •' : ''}
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {/* Customer: walk-in by default. Picking a customer allows "Credit (pay
 later)" at payment time and puts the balance on their account. */}
        {customersEnabled ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer
              </span>
              <select
                aria-label="Customer"
                className="h-10 min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Walk-in (no customer)</option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.balanceKobo > 0 ? ` — owes ${formatKobo(c.balanceKobo)}` : ''}
                  </option>
                ))}
              </select>
              {customerId ? (
                <Button variant="ghost" size="sm" onClick={() => setCustomerId('')}>
                  Clear
                </Button>
              ) : (
                <span className="text-xs text-slate-500">Pick a customer to sell on credit.</span>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[200px_1fr_360px]">
          {/* Category rail */}
          <Card className="hidden shadow-card xl:block">
            <CardContent className="space-y-1 p-3">
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={cn(
                  'w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                  categoryId === ''
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                All items
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'w-full truncate rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    categoryId === c.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-brand-50 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Product grid */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-card focus-within:border-brand-400 dark:border-slate-700 dark:bg-slate-900">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400 dark:text-white"
                placeholder="Search name, SKU, or scan barcode… (Enter adds first match)"
                aria-label="Search products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const code = search.trim();
                    if (!code) return;
                    void (async () => {
                      const scanned = await addScannedCode(code);
                      if (!scanned) {
                        const first = productsQuery.data?.items[0];
                        if (first) {
                          addToCart(first);
                          setSearch('');
                        }
                      }
                    })();
                  }
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {/* Mobile category chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={cn(
                  'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold',
                  categoryId === ''
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                )}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium',
                    categoryId === c.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {productsQuery.isLoading && <LoadingState label="Loading products…" />}
            {productsQuery.isError && <ErrorState message="Could not load products" />}
            {productsQuery.data && productsQuery.data.items.length === 0 ? (
              <EmptyState
                title="No products found"
                hint="Try a different search, or add the product first."
              />
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
              {productsQuery.data?.items.map((p) => {
                const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
                const out = p.onHand <= 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => !out && addToCart(p)}
                    disabled={out}
                    className={cn(
                      'group relative flex flex-col rounded-2xl border bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.98] dark:bg-slate-900',
                      inCart > 0
                        ? 'border-brand-500 ring-1 ring-brand-500'
                        : 'border-slate-200 dark:border-slate-700',
                      out && 'cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-card'
                    )}
                  >
                    {inCart > 0 ? (
                      <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white shadow">
                        {inCart}
                      </span>
                    ) : null}
                    <ProductThumb
                      imagePath={p.imagePath}
                      name={p.name}
                      size="md"
                      className="mb-1"
                    />
                    <span className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-snug">
                      {p.name}
                    </span>
                    <span className="mt-0.5 text-xs text-slate-500">{p.onHand} in stock</span>
                    <span className="mt-1 text-[15px] font-bold tabular-nums text-brand-700 dark:text-brand-300">
                      {formatKobo(p.sellingPriceKobo)}
                    </span>
                    {out ? (
                      <span className="mt-1 text-xs font-bold text-red-500">Out of stock</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sticky cart */}
          <Card className="shadow-card xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-brand-600" />
                  Cart
                  {tableId ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {(tablesQuery.data ?? []).find((t) => t.id === tableId)?.name ?? 'Table'}
                    </span>
                  ) : null}
                </span>
                {cartCount > 0 ? (
                  <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    {cartCount}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <EmptyState title="Cart is empty" hint="Tap any product to add it here." />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
                  {cart.map((l) => {
                    const gross = l.unitPriceKobo * l.qty;
                    const lineTotal = gross - Math.min(l.lineDiscountKobo, gross);
                    return (
                      <li
                        key={l.product.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{l.product.name}</p>
                            <p className="text-xs tabular-nums text-slate-500">
                              {formatKobo(l.unitPriceKobo)} each
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(l.product.id)}
                            aria-label={`Remove ${l.product.name}`}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() =>
                                l.qty <= 1
                                  ? removeLine(l.product.id)
                                  : updateLine(l.product.id, { qty: l.qty - 1 })
                              }
                              className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-7 text-center text-sm font-bold tabular-nums">
                              {l.qty}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() =>
                                updateLine(l.product.id, { qty: Math.min(l.qty + 1, 1_000_000) })
                              }
                              className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-bold tabular-nums">
                            {formatKobo(lineTotal)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <div className="space-y-1.5 border-t border-dashed border-slate-200 pt-3 text-sm dark:border-slate-700">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatKobo(totals.subtotal)}</span>
                </div>
                {totals.lineDiscount > 0 ? (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Line discounts</span>
                    <span className="tabular-nums">−{formatKobo(totals.lineDiscount)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                  <label htmlFor="pos-header-discount">Extra discount (₦)</label>
                  <Input
                    id="pos-header-discount"
                    inputMode="decimal"
                    value={headerDiscount}
                    onChange={(e) => setHeaderDiscount(e.target.value)}
                    className="h-8 w-24 px-2 text-right tabular-nums"
                  />
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Tax (est.)</span>
                  <span className="tabular-nums">{formatKobo(totals.taxEstimate)}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="font-bold">Total</span>
                  <span className="text-2xl font-black tabular-nums tracking-tight text-brand-700 dark:text-brand-300">
                    {formatKobo(totals.total)}
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full text-base"
                disabled={cart.length === 0}
                onClick={openTender}
              >
                Charge {formatKobo(totals.total)}
              </Button>
              {cart.length > 0 ? (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setCart([])}>
                  Clear cart
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tender dialog */}
      <Modal open={tenderOpen} onClose={() => setTenderOpen(false)} title="Take payment">
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-50 p-4 text-center dark:bg-brand-950/40">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-300">
              Amount due
            </p>
            <p className="text-3xl font-black tabular-nums tracking-tight">
              {formatKobo(totals.total)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(METHOD_META) as PaymentMethod[]).map((m) => {
              const Meta = METHOD_META[m];
              const active = payments.length === 1 && payments[0]?.method === m;
              const blocked = m === 'credit' && customerId === '';
              return (
                <button
                  key={m}
                  type="button"
                  disabled={blocked}
                  title={blocked ? 'Select a customer first' : Meta.label}
                  onClick={() =>
                    setPayments([{ method: m, amountKobo: totals.total, reference: '' }])
                  }
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-xs font-semibold transition-all',
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300',
                    blocked && 'cursor-not-allowed opacity-40 hover:border-slate-200'
                  )}
                >
                  <Meta.icon className="h-6 w-6" aria-hidden />
                  {Meta.short}
                </button>
              );
            })}
          </div>
          {payments.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex w-28 shrink-0 items-center gap-1.5 text-sm font-medium">
                {(() => {
                  const Icon = METHOD_META[p.method].icon;
                  return <Icon className="h-4 w-4 text-brand-600" aria-hidden />;
                })()}
                {METHOD_META[p.method].short}
              </span>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={(p.amountKobo / 100).toFixed(2)}
                onChange={(e) => {
                  const next = [...payments];
                  const cur = next[i]!;
                  next[i] = {
                    method: cur.method,
                    amountKobo: parseNairaToKobo(e.target.value) ?? 0,
                    reference: cur.reference,
                  };
                  setPayments(next);
                }}
                className="flex-1 text-right tabular-nums"
              />
              {payments.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                  aria-label="Remove payment"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setPayments([...payments, { method: 'transfer', amountKobo: 0, reference: '' }])
            }
          >
            <Plus className="h-4 w-4" /> Split payment
          </Button>
          {customerId !== '' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={creditRemaining === 0}
              onClick={() =>
                setPayments([
                  ...payments.filter((p) => p.method !== 'credit'),
                  { method: 'credit', amountKobo: creditRemaining, reference: '' },
                ])
              }
            >
              <CreditCard className="h-4 w-4" /> Put remaining {formatKobo(creditRemaining)} on
              credit
            </Button>
          ) : null}
          {payments.some((p) => p.method === 'transfer' || p.method === 'pos') ? (
            <Input
              placeholder="Transfer / POS reference (optional)"
              value={
                payments.find((p) => p.method === 'transfer' || p.method === 'pos')?.reference ?? ''
              }
              onChange={(e) => {
                const next = payments.map((p) =>
                  p.method === 'transfer' || p.method === 'pos'
                    ? { ...p, reference: e.target.value }
                    : p
                );
                setPayments(next);
              }}
            />
          ) : null}
          <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
            <span className="text-slate-500">Paid</span>
            <span className="font-bold tabular-nums">{formatKobo(paidTotal)}</span>
          </div>
          <div
            className={cn(
              'flex justify-between rounded-xl px-3 py-2 text-sm font-bold',
              paidTotal >= totals.total
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
            )}
          >
            <span>{paidTotal >= totals.total ? 'Change due' : 'Still needed'}</span>
            <span className="tabular-nums">{formatKobo(Math.abs(paidTotal - totals.total))}</span>
          </div>
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setTenderOpen(false)}>
              Back
            </Button>
            <Button
              size="lg"
              className="flex-[2]"
              disabled={saleMutation.isPending || paidTotal < totals.total}
              onClick={() => saleMutation.mutate()}
            >
              {saleMutation.isPending
                ? 'Processing…'
                : `Complete sale • ${formatKobo(totals.total)}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Receipt dialog */}
      <Modal
        open={completedSale != null}
        onClose={() => setCompletedSale(null)}
        title="Sale complete"
      >
        {completedSale ? (
          <div className="space-y-3">
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-3 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              Payment received — give change {formatKobo(completedSale.changeKobo)}
            </p>
            <ReceiptView
              sale={completedSale}
              business={businessQuery.data ?? null}
              onClose={() => setCompletedSale(null)}
            />
            {receiptNotice ? (
              <p className="text-center text-sm font-medium text-red-600">{receiptNotice}</p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* History dialog */}
      <Modal
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setSelectedSaleId(null);
        }}
        title="Sales history"
      >
        <SalesHistory
          selectedId={selectedSaleId}
          onSelect={setSelectedSaleId}
          onRefundDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['sales-history'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
            setSelectedSaleId(null);
          }}
        />
      </Modal>
    </RequirePermission>
  );
}

function ReceiptView({
  sale,
  business,
  onClose,
}: {
  sale: SaleDetail;
  business: BusinessProfile | null;
  onClose: () => void;
}): JSX.Element {
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function printReceipt(): Promise<void> {
    setPrinting(true);
    setNotice(null);
    const outcome = await printSale(sale, business);
    setPrinting(false);
    setNotice(
      outcome.ok
        ? outcome.usedFallback
          ? 'Opened the system print dialog.'
          : 'Receipt sent to the printer.'
        : (outcome.error ?? 'Could not print the receipt')
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
        {business?.name ? <p className="text-center font-bold">{business.name}</p> : null}
        {business?.address ? <p className="text-center">{business.address}</p> : null}
        <h2 className="text-center font-bold">SALE RECEIPT</h2>
        <p className="text-center">{sale.receiptNo}</p>
        <p className="text-center">{new Date(sale.createdAt).toLocaleString()}</p>
        <p className="text-center">
          {sale.locationName}
          {sale.cashierName ? ` · ${sale.cashierName}` : ''}
        </p>
        {sale.tableName ? <p className="text-center font-bold">{sale.tableName}</p> : null}
        <table className="w-full">
          <tbody>
            {sale.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.productName} × {i.qty}
                  <br />
                  <span>
                    @ {formatKobo(i.unitPriceKobo)}
                    {i.lineDiscountKobo > 0 ? ` − ${formatKobo(i.lineDiscountKobo)}` : ''}
                  </span>
                </td>
                <td className="text-right">{formatKobo(i.lineTotalKobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="totals w-full">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="text-right">{formatKobo(sale.subtotalKobo)}</td>
            </tr>
            {sale.lineDiscountKobo > 0 && (
              <tr>
                <td>Line discounts</td>
                <td className="text-right">−{formatKobo(sale.lineDiscountKobo)}</td>
              </tr>
            )}
            {sale.headerDiscountKobo > 0 && (
              <tr>
                <td>Discount</td>
                <td className="text-right">−{formatKobo(sale.headerDiscountKobo)}</td>
              </tr>
            )}
            <tr>
              <td>Tax</td>
              <td className="text-right">{formatKobo(sale.taxKobo)}</td>
            </tr>
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td className="text-right">
                <strong>{formatKobo(sale.totalKobo)}</strong>
              </td>
            </tr>
            {sale.payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {METHOD_META[p.method].label}
                  {p.reference ? ` (${p.reference})` : ''}
                </td>
                <td className="text-right">{formatKobo(p.amountKobo)}</td>
              </tr>
            ))}
            {sale.changeKobo > 0 && (
              <tr>
                <td>Change</td>
                <td className="text-right">{formatKobo(sale.changeKobo)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-center">Thank you for your patronage!</p>
        {sale.status !== 'completed' && (
          <p className="text-center">*** {sale.status.toUpperCase()} ***</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          <Receipt className="h-4 w-4" />
          New sale
        </Button>
        <Button className="flex-1" onClick={() => void printReceipt()} disabled={printing}>
          <Printer className="h-4 w-4" />
          {printing ? 'Printing…' : 'Print receipt'}
        </Button>
      </div>
      {notice ? (
        <p className="text-center text-sm text-slate-600 dark:text-slate-300">{notice}</p>
      ) : null}
    </div>
  );
}

function SalesHistory({
  selectedId,
  onSelect,
  onRefundDone,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefundDone: () => void;
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [refundReason, setRefundReason] = useState('');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ['sales-history', page],
    queryFn: async () => {
      const res = await ipc.sales({ page, pageSize: 15 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load sales');
      return res as { items: SaleSummaryRow[]; total: number };
    },
  });

  const detailQuery = useQuery({
    queryKey: ['sales-history-detail', selectedId],
    queryFn: async () => {
      if (!selectedId) throw new Error('No sale selected');
      const res = await ipc.saleGet(selectedId);
      if (!res.ok || !res.sale) throw new Error(res.error ?? 'Could not load sale');
      return res.sale as SaleDetail;
    },
    enabled: selectedId != null,
  });

  const businessQuery = useQuery({
    queryKey: ['business-profile'],
    queryFn: async () => {
      const res = await ipc.businessProfile();
      return res.ok ? ((res.business ?? null) as BusinessProfile | null) : null;
    },
    staleTime: 5 * 60_000,
  });

  const refundMutation = useMutation({
    mutationFn: async ({ id, voidIt }: { id: string; voidIt: boolean }) => {
      const res = voidIt
        ? await ipc.saleVoid(id, { reason: refundReason })
        : await ipc.saleRefund(id, { reason: refundReason });
      if (!res.ok) throw new Error(res.error ?? 'Reversal failed');
    },
    onSuccess: async () => {
      setRefundReason('');
      setHistoryError(null);
      await queryClient.invalidateQueries({ queryKey: ['sales-history'] });
      await queryClient.invalidateQueries({ queryKey: ['sales-history-detail'] });
      await queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      onRefundDone();
    },
    onError: (e: Error) => setHistoryError(e.message),
  });

  if (selectedId && detailQuery.data) {
    const sale = detailQuery.data;
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          ← Back to list
        </Button>
        <div className="flex items-center justify-between">
          <span className="font-bold">{sale.receiptNo}</span>
          <StatusBadge status={sale.status} />
        </div>
        <ReceiptView
          sale={sale}
          business={businessQuery.data ?? null}
          onClose={() => onSelect(null)}
        />
        {sale.status === 'completed' && (
          <RequirePermission permission="sales.refund">
            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <Input
                placeholder="Reason for refund/void (min 3 chars)"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
              {historyError ? (
                <p className="text-sm font-medium text-red-600">{historyError}</p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={refundReason.trim().length < 3 || refundMutation.isPending}
                  onClick={() => refundMutation.mutate({ id: sale.id, voidIt: false })}
                >
                  Refund
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={refundReason.trim().length < 3 || refundMutation.isPending}
                  onClick={() => refundMutation.mutate({ id: sale.id, voidIt: true })}
                >
                  Void
                </Button>
              </div>
            </div>
          </RequirePermission>
        )}
        {sale.reversal ? (
          <p className="text-sm text-slate-500">
            Reversed by {sale.reversal.reversedBy ?? 'unknown'}: {sale.reversal.reason}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <RequirePermission permission="sales.create">
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import sales CSV
          </Button>
        </div>
      </RequirePermission>
      {historyQuery.isLoading && <LoadingState label="Loading sales…" />}
      {historyQuery.isError && <ErrorState message="Could not load sales history" />}
      {historyQuery.data?.items.length === 0 && (
        <EmptyState title="No sales yet" hint="Completed sales will appear here." />
      )}
      {historyQuery.data?.items.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold">{s.receiptNo}</span>
            <span className="block truncate text-xs text-slate-500">
              {new Date(s.createdAt).toLocaleString()} · {s.itemCount} items
              {s.cashierName ? ` · ${s.cashierName}` : ''}
              {s.tableName ? ` · ${s.tableName}` : ''}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <StatusBadge status={s.status} />
            <span className="font-bold tabular-nums">{formatKobo(s.totalKobo)}</span>
          </span>
        </button>
      ))}
      {(historyQuery.data?.total ?? 0) > 15 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <span className="text-sm tabular-nums">Page {page}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      <ImportDialog
        open={importOpen}
        kind="sales"
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void queryClient.invalidateQueries({ queryKey: ['sales-history'] });
          void queryClient.invalidateQueries({ queryKey: ['pos-products'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard-sales'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard-levels'] });
          void queryClient.invalidateQueries({ queryKey: ['customers'] });
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: SaleSummaryRow['status'] }): JSX.Element {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-bold',
        status === 'completed' &&
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        status === 'refunded' &&
          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        status === 'voided' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
      )}
    >
      {status === 'completed' ? 'Paid' : status === 'refunded' ? 'Refunded' : 'Voided'}
    </span>
  );
}
