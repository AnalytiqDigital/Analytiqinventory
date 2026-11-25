import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import { loadAllProducts } from '../lib/products';
import type { LocationRow, StockAdjustmentRow } from '../types/global';

type Tab = 'list' | 'new';

interface DraftLine {
  key: string;
  productId: string;
  qtyDelta: string;
  note: string;
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return { key: `adj-${lineSeq}`, productId: '', qtyDelta: '', note: '' };
}

export function StockAdjustmentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const res = await ipc.locations();
      if (!res.ok) throw new Error(res.error ?? 'Could not load branches');
      return (res.items ?? []) as LocationRow[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'for-adjustment'],
    queryFn: () => loadAllProducts(),
  });

  const listQuery = useQuery({
    queryKey: ['stock-adjustments'],
    queryFn: async () => {
      const res = await ipc.stockAdjustments({ limit: 100, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load adjustments');
      return res.items as StockAdjustmentRow[];
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const locations = locationsQuery.data ?? [];
  const adjustments = listQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error('Give a reason of at least 3 characters');
      const items = lines
        .filter((l) => l.productId !== '')
        .map((l) => {
          const qtyDelta = Number(l.qtyDelta);
          if (!Number.isInteger(qtyDelta) || qtyDelta === 0) {
            throw new Error('Each line needs a whole, non-zero change (for example -2 or 5)');
          }
          return { productId: l.productId, qtyDelta, note: l.note.trim() };
        });
      if (items.length === 0) throw new Error('Add at least one product line');
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.productId)) {
          throw new Error('A product appears twice — combine the changes into one line');
        }
        seen.add(item.productId);
      }
      const res = await ipc.stockAdjustmentCreate({
        locationId: locationId === '' ? null : locationId,
        reason: reason.trim(),
        note: note.trim(),
        items,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the adjustment');
      return res as { reference?: string };
    },
    onSuccess: async (res) => {
      setNotice(`Adjustment ${res.reference ?? ''} saved. Stock and the ledger are updated.`);
      setFormError(null);
      setReason('');
      setNote('');
      setLines([blankLine()]);
      await queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      setTab('list');
    },
    onError: (e: Error) => {
      setNotice(null);
      setFormError(e.message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Stock Adjustments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record damage, losses and recounts. Every change is written to the stock ledger.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={tab === 'list' ? 'primary' : 'secondary'}
            onClick={() => setTab('list')}
          >
            List adjustments
          </Button>
          <Button
            size="sm"
            variant={tab === 'new' ? 'primary' : 'secondary'}
            onClick={() => setTab('new')}
          >
            <Plus className="h-4 w-4" /> Add adjustment
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      {tab === 'list' ? (
        listQuery.isLoading ? (
          <LoadingState label="Loading adjustments…" />
        ) : listQuery.isError ? (
          <ErrorState
            message={(listQuery.error as Error).message}
            onRetry={() => void listQuery.refetch()}
          />
        ) : adjustments.length === 0 ? (
          <EmptyState
            title="No adjustments yet"
            hint="When stock is damaged or miscounted, record it here so the ledger stays true."
            actionLabel="Add adjustment"
            onAction={() => setTab('new')}
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <THead>
                  <TRow>
                    <TH>Reference</TH>
                    <TH>Date</TH>
                    <TH>Branch</TH>
                    <TH>Reason</TH>
                    <TH className="text-right">Lines</TH>
                    <TH className="text-right">Net change</TH>
                  </TRow>
                </THead>
                <tbody>
                  {adjustments.map((row) => (
                    <TRow key={row.id}>
                      <TD className="font-medium">{row.reference}</TD>
                      <TD className="text-slate-500">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </TD>
                      <TD>{row.locationName || '—'}</TD>
                      <TD>
                        {row.reason}
                        {row.note ? (
                          <span className="block text-xs text-slate-500">{row.note}</span>
                        ) : null}
                      </TD>
                      <TD className="text-right tabular-nums">{row.items.length}</TD>
                      <TD className="text-right tabular-nums font-semibold">
                        {row.items.reduce((sum, item) => sum + item.qtyDelta, 0)}
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="adjust-location">
                  Branch
                </label>
                <select
                  id="adjust-location"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">Main branch</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Reason"
                placeholder="e.g. Damaged in transit"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Input
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lines — use a minus sign to reduce stock
              </p>
              {lines.map((line) => (
                <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
                  <select
                    aria-label="Product"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={line.productId}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((l) =>
                          l.key === line.key ? { ...l, productId: e.target.value } : l
                        )
                      )
                    }
                  >
                    <option value="">Choose a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.sku ? ` · ${product.sku}` : ''}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Change in quantity"
                    type="number"
                    placeholder="-2"
                    value={line.qtyDelta}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((l) =>
                          l.key === line.key ? { ...l, qtyDelta: e.target.value } : l
                        )
                      )
                    }
                  />
                  <Input
                    aria-label="Line note"
                    placeholder="Why this line changed (optional)"
                    value={line.note}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((l) => (l.key === line.key ? { ...l, note: e.target.value } : l))
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setLines((c) => [...c, blankLine()])}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>

            {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}
            <div className="flex justify-end">
              <Button
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                <ClipboardList className="h-4 w-4" />
                {createMutation.isPending ? 'Saving…' : 'Save adjustment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
