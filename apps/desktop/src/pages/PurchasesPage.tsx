import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  PackageCheck,
  Plus,
  Truck,
  XCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { ProductRow, PurchaseRow, SupplierRow } from '../types/global';

const PAGE_SIZE = 50;
const STATUSES = ['draft', 'received', 'cancelled'] as const;

interface DraftLine {
  key: string;
  productId: string;
  qty: string;
  unitCost: string;
}

interface PurchaseFormValues {
  supplierId: string;
  reference: string;
  note: string;
  tax: string;
  amountPaid: string;
  lines: DraftLine[];
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return { key: `line-${lineSeq}`, productId: '', qty: '1', unitCost: '0.00' };
}

function blankForm(): PurchaseFormValues {
  return {
    supplierId: '',
    reference: '',
    note: '',
    tax: '0.00',
    amountPaid: '0.00',
    lines: [blankLine()],
  };
}

function statusTone(status: string): string {
  if (status === 'received')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
}

export function PurchasesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<string>('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [values, setValues] = useState<PurchaseFormValues>(blankForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const purchasesQuery = useQuery({
    queryKey: ['purchases', debounced, status, supplierId, page],
    queryFn: async () => {
      const res = await ipc.purchases({
        search: debounced,
        status: status || null,
        supplierId: supplierId || null,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load purchases');
      return res as { items: PurchaseRow[]; total: number };
    },
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'for-purchase'],
    queryFn: async () => {
      const res = await ipc.suppliers({ limit: 200, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load suppliers');
      return (res.items ?? []) as SupplierRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'for-purchase'],
    queryFn: async () => {
      const res = await ipc.products({ search: '', page: 1, pageSize: 200 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return (res.items ?? []) as ProductRow[];
    },
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['purchases'] });
    await queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    await queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const lines = values.lines
        .filter((l) => l.productId !== '' || l.qty !== '1' || l.unitCost !== '0.00')
        .map((l) => {
          const unitCostKobo = parseNairaToKobo(l.unitCost.trim() === '' ? '0' : l.unitCost);
          if (unitCostKobo === null)
            throw new Error('Each unit cost must be an amount like 1500.00');
          const qty = Number(l.qty);
          return { productId: l.productId, qty, unitCostKobo };
        });
      if (lines.length === 0) throw new Error('Add at least one item');
      for (const l of lines) {
        if (l.productId === '') throw new Error('Choose a product for every line');
        if (!Number.isInteger(l.qty) || l.qty < 1)
          throw new Error('Quantities must be whole numbers of 1 or more');
      }
      const taxKobo = parseNairaToKobo(values.tax.trim() === '' ? '0' : values.tax);
      if (taxKobo === null) throw new Error('Tax must be an amount like 0.00');
      const amountPaidKobo = parseNairaToKobo(
        values.amountPaid.trim() === '' ? '0' : values.amountPaid
      );
      if (amountPaidKobo === null) throw new Error('Amount paid must be an amount like 0.00');
      const res = await ipc.purchasesCreate({
        supplierId: values.supplierId || null,
        reference: values.reference.trim(),
        note: values.note.trim(),
        taxKobo,
        amountPaidKobo,
        items: lines,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the purchase');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setValues(blankForm());
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const receiveMutation = useMutation({
    mutationFn: async (purchase: PurchaseRow) => {
      const res = await ipc.purchasesReceive(purchase.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not receive the purchase');
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (purchase: PurchaseRow) => {
      const res = await ipc.purchasesCancel(purchase.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not cancel the purchase');
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const subtotal = useMemo(() => {
    return values.lines.reduce((sum, l) => {
      const cost = parseNairaToKobo(l.unitCost.trim() === '' ? '0' : l.unitCost) ?? 0;
      const qty = Number(l.qty);
      return sum + (Number.isFinite(qty) && qty > 0 ? cost * qty : 0);
    }, 0);
  }, [values.lines]);

  const items = purchasesQuery.data?.items ?? [];
  const total = purchasesQuery.data?.total ?? 0;
  const drafts = items.filter((p) => p.status === 'draft').length;
  const draftValue = items.filter((p) => p.status === 'draft').reduce((s, p) => s + p.totalKobo, 0);

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setValues((v) => ({
      ...v,
      lines: v.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record stock bought from suppliers, then receive it into inventory.
          </p>
        </div>
        <RequirePermission permission="purchases.manage">
          <Button
            onClick={() => {
              setValues(blankForm());
              setFormError(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New purchase
          </Button>
        </RequirePermission>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Truck} label="Purchases" value={String(total)} tone="brand" />
        <Stat icon={PackageCheck} label="Draft on this page" value={String(drafts)} tone="amber" />
        <Stat
          icon={PackageCheck}
          label="Draft value (this page)"
          value={formatKobo(draftValue)}
          tone="emerald"
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              aria-label="Search purchases"
              placeholder="Search by reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by status"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by supplier"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All suppliers</option>
            {(suppliersQuery.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {actionError ? <ErrorState message={actionError} /> : null}

      {purchasesQuery.isLoading ? <LoadingState label="Loading purchases…" /> : null}
      {purchasesQuery.isError ? (
        <ErrorState
          message={(purchasesQuery.error as Error).message}
          onRetry={() => void purchasesQuery.refetch()}
        />
      ) : null}
      {purchasesQuery.isSuccess && items.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          hint="Record what you bought from a supplier to bring stock into inventory."
          actionLabel="New purchase"
          onAction={() => {
            setValues(blankForm());
            setFormError(null);
            setModalOpen(true);
          }}
        />
      ) : null}
      {purchasesQuery.isSuccess && items.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <THead>
                <TRow>
                  <TH aria-label="Expand" />
                  <TH>Reference</TH>
                  <TH>Supplier</TH>
                  <TH>Total</TH>
                  <TH>Paid</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((p) => {
                  const isOpen = expanded === p.id;
                  return (
                    <Fragment key={p.id}>
                      <TRow>
                        <TD>
                          <button
                            type="button"
                            aria-label={isOpen ? `Hide ${p.reference}` : `Show ${p.reference}`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            onClick={() => setExpanded(isOpen ? null : p.id)}
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TD>
                        <TD>
                          <p className="font-mono text-sm">{p.reference}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(p.createdAt).toLocaleString()}
                          </p>
                        </TD>
                        <TD>{p.supplierName ?? '—'}</TD>
                        <TD className="tabular-nums">{formatKobo(p.totalKobo)}</TD>
                        <TD className="tabular-nums">{formatKobo(p.amountPaidKobo)}</TD>
                        <TD>
                          <Badge className={statusTone(p.status)}>
                            {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                          </Badge>
                        </TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            <RequirePermission permission="purchases.manage">
                              {p.status === 'draft' ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={receiveMutation.isPending}
                                    onClick={() => receiveMutation.mutate(p)}
                                  >
                                    <CheckCircle2 className="h-4 w-4" /> Receive
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={cancelMutation.isPending}
                                    onClick={() => cancelMutation.mutate(p)}
                                  >
                                    <XCircle className="h-4 w-4" /> Cancel
                                  </Button>
                                </>
                              ) : null}
                            </RequirePermission>
                          </div>
                        </TD>
                      </TRow>
                      {isOpen ? (
                        <TRow>
                          <TD />
                          <TD colSpan={6}>
                            <div className="space-y-2 py-1">
                              {p.receivedAt ? (
                                <p className="text-xs text-slate-500">
                                  Received {new Date(p.receivedAt).toLocaleString()}
                                  {p.receivedByName ? ` by ${p.receivedByName}` : ''}
                                </p>
                              ) : null}
                              {p.note ? <p className="text-xs text-slate-500">{p.note}</p> : null}
                              <Table>
                                <THead>
                                  <TRow>
                                    <TH>Product</TH>
                                    <TH>Qty</TH>
                                    <TH>Unit cost</TH>
                                    <TH>Line total</TH>
                                  </TRow>
                                </THead>
                                <tbody>
                                  {p.items.map((it) => (
                                    <TRow key={it.id}>
                                      <TD>
                                        {it.productName}
                                        {it.sku ? (
                                          <span className="ml-2 font-mono text-[11px] text-slate-500">
                                            {it.sku}
                                          </span>
                                        ) : null}
                                      </TD>
                                      <TD className="tabular-nums">{it.qty}</TD>
                                      <TD className="tabular-nums">
                                        {formatKobo(it.unitCostKobo)}
                                      </TD>
                                      <TD className="tabular-nums">
                                        {formatKobo(it.lineTotalKobo)}
                                      </TD>
                                    </TRow>
                                  ))}
                                </tbody>
                              </Table>
                              <p className="text-xs text-slate-500">
                                Subtotal {formatKobo(p.subtotalKobo)} · Tax {formatKobo(p.taxKobo)}{' '}
                                · Total {formatKobo(p.totalKobo)}
                              </p>
                            </div>
                          </TD>
                        </TRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            {total > PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= Math.ceil(total / PAGE_SIZE)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={modalOpen}
        title="New purchase"
        onClose={() => {
          setModalOpen(false);
          createMutation.reset();
        }}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            createMutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="purchase-supplier"
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Supplier (optional)
              </label>
              <select
                id="purchase-supplier"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={values.supplierId}
                onChange={(e) => setValues((v) => ({ ...v, supplierId: e.target.value }))}
              >
                <option value="">— None —</option>
                {(suppliersQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Supplier reference (optional)"
              placeholder="e.g. INV-2291"
              value={values.reference}
              onChange={(e) => setValues((v) => ({ ...v, reference: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Items</p>
            {values.lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_70px_90px_36px] items-end gap-2">
                <select
                  aria-label="Product"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={l.productId}
                  onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                >
                  <option value="">Choose product…</option>
                  {(productsQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Quantity"
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                />
                <Input
                  aria-label="Unit cost"
                  value={l.unitCost}
                  onChange={(e) => updateLine(l.key, { unitCost: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove line"
                  disabled={values.lines.length === 1}
                  onClick={() =>
                    setValues((v) => ({ ...v, lines: v.lines.filter((x) => x.key !== l.key) }))
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setValues((v) => ({ ...v, lines: [...v.lines, blankLine()] }))}
            >
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Tax"
              value={values.tax}
              onChange={(e) => setValues((v) => ({ ...v, tax: e.target.value }))}
            />
            <Input
              label="Amount paid"
              value={values.amountPaid}
              onChange={(e) => setValues((v) => ({ ...v, amountPaid: e.target.value }))}
            />
          </div>
          <Input
            label="Note (optional)"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Subtotal <span className="font-semibold tabular-nums">{formatKobo(subtotal)}</span>
          </p>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save purchase'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
