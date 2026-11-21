import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, PackagePlus, TriangleAlert } from 'lucide-react';
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
import type { BatchRow, LocationRow, ProductRow } from '../types/global';

const EXPIRY_FILTERS = [
  { value: '', label: 'All batches' },
  { value: '30', label: 'Expiring in 30 days' },
  { value: '90', label: 'Expiring in 90 days' },
  { value: '0', label: 'Already expired' },
] as const;

function statusBadge(row: BatchRow): JSX.Element {
  if (row.remaining <= 0)
    return <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Empty</Badge>;
  if (row.status === 'expired')
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Expired</Badge>;
  if (row.status === 'expiring')
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        {row.expiryDate ? `Expires in ${row.nearExpiryDays}d` : 'Near expiry'}
      </Badge>
    );
  return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">OK</Badge>;
}

function dateOnly(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export function BatchesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [expiringDays, setExpiringDays] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const batchesQuery = useQuery({
    queryKey: ['batches', debounced, expiringDays, includeEmpty],
    queryFn: async () => {
      const res = await ipc.batches({
        search: debounced,
        includeEmpty,
        expiringDays: expiringDays === '' ? null : Number(expiringDays),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load batches');
      return res as { items: BatchRow[]; total: number; expiringCount: number; expiredCount: number };
    },
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'for-batch'],
    queryFn: async () => {
      const res = await ipc.products({ search: '', page: 1, pageSize: 500 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return (res.items ?? []) as ProductRow[];
    },
  });

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await ipc.locations();
      if (!res.ok) throw new Error(res.error ?? 'Could not load branches');
      return (res.items ?? []) as LocationRow[];
    },
  });

  const batchProducts = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.trackBatches),
    [productsQuery.data]
  );

  const intakeMutation = useMutation({
    mutationFn: async () => {
      if (productId === '') throw new Error('Choose a product');
      const parsedQty = Number(qty);
      if (!Number.isInteger(parsedQty) || parsedQty < 1) throw new Error('Quantity must be 1 or more');
      const res = await ipc.batchIntake({
        productId,
        locationId: locationId || null,
        batchNo: batchNo.trim(),
        expiryDate: expiryDate ? new Date(`${expiryDate}T23:59:59`).toISOString() : null,
        qty: parsedQty,
        note: note.trim(),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not add the batch');
    },
    onSuccess: async () => {
      setIntakeOpen(false);
      setProductId('');
      setBatchNo('');
      setExpiryDate('');
      setQty('1');
      setNote('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const data = batchesQuery.data;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Batches &amp; Expiry</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track batch numbers and expiry dates so near-expiry stock is sold first.
          </p>
        </div>
        <RequirePermission permission="inventory.adjust">
          <Button onClick={() => setIntakeOpen(true)} disabled={batchProducts.length === 0}>
            <PackagePlus className="h-4 w-4" /> Receive batch
          </Button>
        </RequirePermission>
      </div>

      {batchProducts.length === 0 && (productsQuery.data?.length ?? 0) > 0 ? (
        <Card>
          <CardContent className="text-sm text-slate-600 dark:text-slate-300">
            No product has batch tracking switched on yet. Edit a product and turn on{' '}
            <span className="font-semibold">Track batches &amp; expiry</span> to start.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={CalendarClock} label="Batches shown" value={String(data?.total ?? 0)} tone="brand" />
        <Stat
          icon={TriangleAlert}
          label="Expiring soon"
          value={String(data?.expiringCount ?? 0)}
          tone="amber"
        />
        <Stat icon={TriangleAlert} label="Already expired" value={String(data?.expiredCount ?? 0)} tone="violet" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              placeholder="Search product, SKU or batch number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search batches"
            />
          </div>
          <select
            value={expiringDays}
            onChange={(e) => setExpiringDays(e.target.value)}
            aria-label="Expiry filter"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {EXPIRY_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(e) => setIncludeEmpty(e.target.checked)}
            />
            Show empty batches
          </label>
        </CardContent>
      </Card>

      {batchesQuery.isPending ? (
        <LoadingState label="Loading batches…" />
      ) : batchesQuery.isError ? (
        <ErrorState message={(batchesQuery.error as Error).message} onRetry={() => batchesQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No batches to show"
          hint="Receive stock with a batch number and expiry date, or relax the filter."
        />
      ) : (
        <Table>
          <THead>
            <TRow>
              <TH>Product</TH>
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH>Branch</TH>
              <TH className="text-right">Left</TH>
              <TH className="text-right">On hand</TH>
              <TH>Status</TH>
            </TRow>
          </THead>
          <tbody>
            {items.map((row) => (
              <TRow key={row.id}>
                <TD>
                  <span className="font-medium">{row.productName}</span>
                  {row.sku ? <span className="ml-2 text-xs text-slate-400">{row.sku}</span> : null}
                </TD>
                <TD className="font-mono text-xs">{row.batchNo || '—'}</TD>
                <TD>{dateOnly(row.expiryDate)}</TD>
                <TD className="text-xs">{row.locationName}</TD>
                <TD className="text-right tabular-nums">{row.remaining}</TD>
                <TD className="text-right tabular-nums">{row.onHand}</TD>
                <TD>{statusBadge(row)}</TD>
              </TRow>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={intakeOpen} title="Receive a batch" onClose={() => setIntakeOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Product
            </label>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setFormError(null);
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">— Choose a product —</option>
              {batchProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Batch number"
              placeholder="e.g. PCM-2408"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
            />
            <Input
              label="Quantity"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Expiry date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Branch
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Default branch</option>
                {(locationsQuery.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setIntakeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => intakeMutation.mutate()} disabled={intakeMutation.isPending}>
              {intakeMutation.isPending ? 'Saving…' : 'Add batch'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
