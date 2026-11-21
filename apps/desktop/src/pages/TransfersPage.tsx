import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import type { LocationRow, ProductRow, StockTransferRow } from '../types/global';

interface DraftLine {
  key: string;
  productId: string;
  qty: string;
}

let lineSeq = 0;
function blankLine(): DraftLine {
  lineSeq += 1;
  return { key: `tl-${lineSeq}`, productId: '', qty: '1' };
}

export function TransfersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
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
    queryKey: ['products', 'for-transfer'],
    queryFn: async () => {
      const res = await ipc.products({ search: '', page: 1, pageSize: 500 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return (res.items ?? []) as ProductRow[];
    },
  });

  const transfersQuery = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const res = await ipc.transfers({ limit: 50, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load transfers');
      return res as { items: StockTransferRow[]; total: number };
    },
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const locations = locationsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (fromLocationId === '') throw new Error('Choose the branch sending the stock');
      if (toLocationId === '') throw new Error('Choose the branch receiving the stock');
      if (fromLocationId === toLocationId) throw new Error('Choose two different branches');
      const items = lines
        .filter((l) => l.productId !== '')
        .map((l) => {
          const qty = Number(l.qty);
          if (!Number.isInteger(qty) || qty < 1)
            throw new Error('Quantities must be whole numbers of 1 or more');
          return { productId: l.productId, qty };
        });
      if (items.length === 0) throw new Error('Add at least one product');
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.productId)) throw new Error('A product appears twice — combine the quantities');
        seen.add(item.productId);
      }
      const res = await ipc.transferCreate({
        fromLocationId,
        toLocationId,
        note: note.trim(),
        items,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not record the transfer');
      return res as { reference?: string };
    },
    onSuccess: async (res) => {
      setNotice(`Transfer ${res.reference ?? ''} recorded. Stock left the sending branch.`);
      setLines([blankLine()]);
      setNote('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['transfers'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setFormError(e.message);
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Stock Transfers</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Move stock between branches. Both sides are written to the stock ledger.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                From branch
              </label>
              <select
                value={fromLocationId}
                onChange={(e) => setFromLocationId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">— Sending branch —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                To branch
              </label>
              <select
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">— Receiving branch —</option>
                {locations
                  .filter((l) => l.id !== fromLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={line.key} className="flex items-center gap-2">
                <select
                  aria-label={`Product ${index + 1}`}
                  value={line.productId}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, productId: e.target.value } : l))
                    )
                  }
                  className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">— Choose a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` (${p.sku})` : ''} · {p.onHand} on hand
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={`Quantity ${index + 1}`}
                  inputMode="numeric"
                  value={line.qty}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key ? { ...l, qty: e.target.value.replace(/[^0-9]/g, '') } : l
                      )
                    )
                  }
                  className="h-10 w-24 text-right"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove line"
                  onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== line.key)))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, blankLine()])}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </div>

          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}

          <RequirePermission permission="inventory.adjust">
            <div className="flex justify-end">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                <ArrowLeftRight className="h-4 w-4" />
                {createMutation.isPending ? 'Recording…' : 'Record transfer'}
              </Button>
            </div>
          </RequirePermission>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer history</CardTitle>
        </CardHeader>
        <CardContent>
          {transfersQuery.isPending ? (
            <LoadingState label="Loading transfers…" />
          ) : transfersQuery.isError ? (
            <ErrorState message={(transfersQuery.error as Error).message} />
          ) : (transfersQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="No transfers yet" hint="Transfers between branches will be listed here." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Reference</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH>Items</TH>
                  <TH>When</TH>
                </TRow>
              </THead>
              <tbody>
                {transfersQuery.data?.items.map((t) => (
                  <TRow key={t.id}>
                    <TD className="font-mono text-xs">{t.reference}</TD>
                    <TD>{t.fromLocationName}</TD>
                    <TD>{t.toLocationName}</TD>
                    <TD className="text-xs">
                      {t.items.map((i) => `${i.qty}× ${i.productName}`).join(', ')}
                    </TD>
                    <TD className="text-xs">{new Date(t.createdAt).toLocaleString()}</TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
