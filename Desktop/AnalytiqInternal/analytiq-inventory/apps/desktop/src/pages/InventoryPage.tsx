import { stockAdjustSchema, stockCountSchema } from '@analytiq/validation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import type { MovementRow, ProductRow, StockLevelRow } from '../types/global';

export function InventoryPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [target, setTarget] = useState<ProductRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const levelsQuery = useQuery({
    queryKey: ['levels', debounced, lowOnly],
    queryFn: async () => {
      const res = await ipc.stockLevels({ search: debounced, lowOnly, page: 1, pageSize: 100 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load stock levels');
      return res as { items: StockLevelRow[]; total: number };
    },
  });

  const movementsQuery = useQuery({
    queryKey: ['movements', 'recent'],
    queryFn: async () => {
      const res = await ipc.stockMovements({ page: 1, pageSize: 30 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load movements');
      return res.items as MovementRow[];
    },
  });

  const invalidate = (): Promise<unknown> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['levels'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['product'] }),
    ]);

  const adjustForm = useForm<{ quantityDelta: number; reason: string }>({ defaultValues: { quantityDelta: 1, reason: '' } });
  const countForm = useForm<{ countedQty: number; reason: string }>({ defaultValues: { countedQty: 0, reason: '' } });

  const adjustMutation = useMutation({
    mutationFn: async (values: { quantityDelta: number; reason: string }) => {
      if (!target) throw new Error('Select a product first');
      const parsed = stockAdjustSchema.safeParse({ productId: target.id, quantityDelta: values.quantityDelta, reason: values.reason });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid adjustment');
      const res = await ipc.stockAdjust(parsed.data);
      if (!res.ok) throw new Error(res.error ?? 'Adjustment failed');
    },
    onSuccess: () => {
      setAdjustOpen(false);
      setTarget(null);
      adjustForm.reset({ quantityDelta: 1, reason: '' });
      void invalidate();
    },
  });

  const countMutation = useMutation({
    mutationFn: async (values: { countedQty: number; reason: string }) => {
      if (!target) throw new Error('Select a product first');
      const parsed = stockCountSchema.safeParse({ productId: target.id, countedQty: values.countedQty, reason: values.reason });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid count');
      const res = await ipc.stockCount(parsed.data);
      if (!res.ok) throw new Error(res.error ?? 'Count failed');
    },
    onSuccess: () => {
      setCountOpen(false);
      setTarget(null);
      countForm.reset({ countedQty: 0, reason: '' });
      void invalidate();
    },
  });

  const levels = levelsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          <span className="font-semibold text-brand-600 dark:text-brand-300">{levelsQuery.data?.total ?? 0}</span> stock rows
          {levels.filter((l) => l.low).length > 0 ? (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {levels.filter((l) => l.low).length} low
            </span>
          ) : null}
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-52 flex-1">
              <Input
                aria-label="Search stock"
                placeholder="Search product, SKU, barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              Low stock only
            </label>
          </div>
        </CardContent>
      </Card>

      {levelsQuery.isLoading ? <LoadingState label="Loading stock levels…" /> : null}
      {levelsQuery.isError ? (
        <ErrorState message={(levelsQuery.error as Error).message} onRetry={() => void levelsQuery.refetch()} />
      ) : null}
      {levelsQuery.isSuccess && levels.length === 0 ? (
        <EmptyState title="No stock rows" hint="Products appear here once created." />
      ) : null}
      {levelsQuery.isSuccess && levels.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Stock levels</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TRow><TH>Product</TH><TH>Location</TH><TH>On hand</TH><TH>Actions</TH></TRow></THead>
              <tbody>
                {levels.map((l) => (
                  <TRow key={`${l.productId}-${l.locationId}`}>
                    <TD>
                      <span className="font-medium">{l.productName}</span>
                      {l.sku ? <span className="ml-2 text-xs text-slate-500">{l.sku}</span> : null}
                      {l.low ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Low
                        </span>
                      ) : null}
                    </TD>
                    <TD>{l.locationName}</TD>
                    <TD>
                      <span className="font-bold tabular-nums">{l.onHand}</span>
                    </TD>
                    <TD>
                      <RequirePermission permission="inventory.adjust">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setTarget({ id: l.productId } as ProductRow);
                              adjustForm.reset({ quantityDelta: 1, reason: '' });
                              setAdjustOpen(true);
                            }}
                          >
                            Adjust
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setTarget({ id: l.productId, name: l.productName } as ProductRow);
                              countForm.reset({ countedQty: l.onHand, reason: '' });
                              setCountOpen(true);
                            }}
                          >
                            Count
                          </Button>
                        </div>
                      </RequirePermission>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Recent movements</CardTitle></CardHeader>
        <CardContent>
          {movementsQuery.isLoading ? <LoadingState label="Loading movements…" /> : null}
          {movementsQuery.isError ? <ErrorState message={(movementsQuery.error as Error).message} /> : null}
          {movementsQuery.isSuccess && movementsQuery.data.length === 0 ? (
            <EmptyState title="No movements yet" hint="Every stock change appends a ledger row here." />
          ) : null}
          {movementsQuery.isSuccess && movementsQuery.data.length > 0 ? (
            <Table>
              <THead><TRow><TH>Date</TH><TH>Product</TH><TH>Kind</TH><TH>Change</TH><TH>After</TH><TH>Reason</TH></TRow></THead>
              <tbody>
                {movementsQuery.data.map((m) => (
                  <TRow key={m.id}>
                    <TD>{new Date(m.createdAt).toLocaleString()}</TD>
                    <TD>{m.productName}</TD>
                    <TD><Badge>{m.kind}</Badge></TD>
                    <TD>{m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}</TD>
                    <TD>{m.qtyAfter}</TD>
                    <TD>{m.reason || '—'}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Modal open={adjustOpen} title={`Adjust stock${target?.name ? ` — ${target.name}` : ''}`} onClose={() => setAdjustOpen(false)}>
        <form onSubmit={adjustForm.handleSubmit((v) => adjustMutation.mutate(v))} className="space-y-3">
          <Input
            label="Quantity change (negative to remove)"
            type="number"
            {...adjustForm.register('quantityDelta', { valueAsNumber: true })}
            error={adjustForm.formState.errors.quantityDelta?.message}
          />
          <Input
            label="Reason"
            placeholder="e.g. Damaged goods removed"
            {...adjustForm.register('reason')}
            error={adjustForm.formState.errors.reason?.message}
          />
          {adjustMutation.isError ? <ErrorState message={(adjustMutation.error as Error).message} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Posting…' : 'Post adjustment'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={countOpen} title={`Stock count${target?.name ? ` — ${target.name}` : ''}`} onClose={() => setCountOpen(false)}>
        <form onSubmit={countForm.handleSubmit((v) => countMutation.mutate(v))} className="space-y-3">
          <Input
            label="Counted quantity"
            type="number"
            min={0}
            {...countForm.register('countedQty', { valueAsNumber: true })}
            error={countForm.formState.errors.countedQty?.message}
          />
          <Input
            label="Note (optional)"
            placeholder="e.g. Month-end count"
            {...countForm.register('reason')}
          />
          {countMutation.isError ? <ErrorState message={(countMutation.error as Error).message} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCountOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={countMutation.isPending}>
              {countMutation.isPending ? 'Posting…' : 'Post count'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
