import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Undo2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import type { PurchaseReturnRow, PurchaseRow } from '../types/global';

type Tab = 'list' | 'new';

export function PurchaseReturnsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [purchaseId, setPurchaseId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const purchasesQuery = useQuery({
    queryKey: ['purchases', 'received-for-return'],
    queryFn: async () => {
      const res = await ipc.purchases({ status: 'received', limit: 200, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load purchases');
      return (res.items ?? []) as PurchaseRow[];
    },
  });

  const returnsQuery = useQuery({
    queryKey: ['purchase-returns'],
    queryFn: async () => {
      const res = await ipc.purchaseReturns({ limit: 100, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load purchase returns');
      return res.items as PurchaseReturnRow[];
    },
  });

  const purchases = useMemo(() => purchasesQuery.data ?? [], [purchasesQuery.data]);
  const selected = purchases.find((p) => p.id === purchaseId) ?? null;
  const returns = returnsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Choose the received purchase to return');
      if (reason.trim().length < 3) throw new Error('Give a reason of at least 3 characters');
      const items = selected.items
        .map((item) => ({ productId: item.productId, qty: Number(quantities[item.productId] ?? 0) }))
        .filter((line) => line.qty > 0);
      if (items.length === 0) throw new Error('Enter a return quantity on at least one line');
      for (const line of items) {
        if (!Number.isInteger(line.qty)) throw new Error('Return quantities must be whole numbers');
      }
      const res = await ipc.purchaseReturnCreate({
        purchaseId: selected.id,
        reason: reason.trim(),
        note: note.trim(),
        items,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the purchase return');
      return res as { reference?: string; totalKobo?: number };
    },
    onSuccess: async (res) => {
      setNotice(
        `Purchase return ${res.reference ?? ''} saved${res.totalKobo ? ` · ${formatKobo(res.totalKobo)}` : ''}.`
      );
      setFormError(null);
      setPurchaseId('');
      setReason('');
      setNote('');
      setQuantities({});
      await queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
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
          <h1 className="text-xl font-bold tracking-tight">Purchase Returns</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Send unsuitable stock back to the supplier and keep the ledger balanced.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={tab === 'list' ? 'primary' : 'secondary'}
            onClick={() => setTab('list')}
          >
            List returns
          </Button>
          <Button
            size="sm"
            variant={tab === 'new' ? 'primary' : 'secondary'}
            onClick={() => setTab('new')}
          >
            <Plus className="h-4 w-4" /> Add return
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {notice}
        </div>
      ) : null}

      {tab === 'list' ? (
        returnsQuery.isLoading ? (
          <LoadingState label="Loading purchase returns…" />
        ) : returnsQuery.isError ? (
          <ErrorState
            message={(returnsQuery.error as Error).message}
            onRetry={() => void returnsQuery.refetch()}
          />
        ) : returns.length === 0 ? (
          <EmptyState
            title="No purchase returns yet"
            hint="Return damaged or wrong stock against a received purchase here."
            actionLabel="Add return"
            onAction={() => setTab('new')}
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <THead>
                  <TRow>
                    <TH>Reference</TH>
                    <TH>Purchase</TH>
                    <TH>Supplier</TH>
                    <TH>Reason</TH>
                    <TH className="text-right">Value</TH>
                    <TH>Date</TH>
                  </TRow>
                </THead>
                <tbody>
                  {returns.map((row) => (
                    <TRow key={row.id}>
                      <TD className="font-medium">{row.reference}</TD>
                      <TD>{row.purchaseReference}</TD>
                      <TD>{row.supplierName ?? 'Walk-in supplier'}</TD>
                      <TD>
                        {row.reason}
                        {row.note ? (
                          <span className="block text-xs text-slate-500">{row.note}</span>
                        ) : null}
                      </TD>
                      <TD className="text-right tabular-nums">{formatKobo(row.totalKobo)}</TD>
                      <TD className="text-slate-500">
                        {new Date(row.createdAt).toLocaleDateString()}
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
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="return-purchase">
                Received purchase
              </label>
              <select
                id="return-purchase"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={purchaseId}
                onChange={(e) => {
                  setPurchaseId(e.target.value);
                  setQuantities({});
                }}
              >
                <option value="">Choose a purchase</option>
                {purchases.map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {purchase.reference} · {purchase.supplierName ?? 'Walk-in'} ·{' '}
                    {formatKobo(purchase.totalKobo)}
                  </option>
                ))}
              </select>
              {purchases.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  Receive a purchase first, then you can return stock against it.
                </p>
              ) : null}
            </div>

            {selected ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Bought</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-medium">{item.productName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKobo(item.unitCostKobo)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            aria-label={`Return quantity for ${item.productName}`}
                            type="number"
                            min={0}
                            max={item.qty}
                            className="ml-auto w-24 text-right"
                            value={quantities[item.productId] ?? ''}
                            onChange={(e) =>
                              setQuantities((current) => ({
                                ...current,
                                [item.productId]: e.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Reason"
                placeholder="e.g. Expired on arrival"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Input
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}
            <div className="flex justify-end">
              <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                <Undo2 className="h-4 w-4" />
                {createMutation.isPending ? 'Saving…' : 'Save return'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
