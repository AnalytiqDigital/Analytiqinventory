import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import type { SaleDetail, SaleReturnRow } from '../types/global';

const REFUND_METHODS = ['cash', 'transfer', 'pos'] as const;

export function ReturnsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [receipt, setReceipt] = useState('');
  const [lookupKey, setLookupKey] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<string>('cash');
  const [kind, setKind] = useState<'refund' | 'exchange'>('refund');
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  const saleQuery = useQuery({
    queryKey: ['return-lookup', lookupKey],
    enabled: lookupKey !== '',
    queryFn: async () => {
      const res = await ipc.returnLookup(lookupKey);
      if (!res.ok) throw new Error(res.error ?? 'Receipt not found');
      return res.sale as SaleDetail;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['returns', historySearch],
    queryFn: async () => {
      const res = await ipc.returnsList({ search: historySearch.trim(), limit: 50, offset: 0 });
      if (!res.ok) throw new Error(res.error ?? 'Could not load returns');
      return res as { items: SaleReturnRow[]; total: number };
    },
  });

  const sale = saleQuery.data;
  const picked = useMemo(() => {
    if (!sale) return [];
    return sale.items
      .map((line) => ({ line, qty: Math.floor(Number(qtys[line.id] ?? '0') || 0) }))
      .filter((p) => p.qty > 0);
  }, [sale, qtys]);
  const refundPreview = picked.reduce(
    (sum, p) =>
      sum +
      Math.round(
        ((p.line.lineTotalKobo) / p.line.qty) * p.qty
      ),
    0
  );

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error('Look up a receipt first');
      if (sale.status !== 'completed') throw new Error('This sale is already reversed');
      if (picked.length === 0) throw new Error('Enter how many units of at least one item are coming back');
      for (const p of picked) {
        if (p.qty > p.line.qty) throw new Error(`You cannot return more than ${p.line.qty} of ${p.line.productName}`);
      }
      if (reason.trim().length < 3) throw new Error('Give a reason of at least 3 characters');
      const res = await ipc.returnCreate({
        saleId: sale.id,
        items: picked.map((p) => ({ saleItemId: p.line.id, qty: p.qty })),
        reason: reason.trim(),
        refundMethod,
        kind,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not process the return');
      return res as { refundKobo?: number; fullyReturned?: boolean };
    },
    onSuccess: async (res) => {
      setNotice(
        `${kind === 'exchange' ? 'Exchange' : 'Refund'} recorded: ${formatKobo(res.refundKobo ?? 0)}${
          res.fullyReturned ? ' (receipt fully returned)' : ''
        }. Stock is back on the shelf.`
      );
      setQtys({});
      setReason('');
      setFormError(null);
      if (sale) {
        await queryClient.invalidateQueries({ queryKey: ['return-lookup', lookupKey] });
        await saleQuery.refetch();
      }
      await queryClient.invalidateQueries({ queryKey: ['returns'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      await queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setFormError(e.message);
    },
  });

  function searchReceipt(): void {
    const value = receipt.trim();
    setNotice(null);
    setFormError(null);
    setQtys({});
    if (value === '') {
      setLookupKey('');
      return;
    }
    if (value === lookupKey) void saleQuery.refetch();
    setLookupKey(value);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Returns &amp; Exchanges</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Find the receipt, tick what is coming back, then refund the customer or ring an exchange.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Receipt number"
              placeholder="e.g. RC-000123"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') searchReceipt();
              }}
            />
          </div>
          <Button onClick={searchReceipt}>
            <Search className="h-4 w-4" /> Find receipt
          </Button>
        </CardContent>
      </Card>

      {saleQuery.isPending && lookupKey !== '' ? <LoadingState label="Looking up the receipt…" /> : null}
      {saleQuery.isError ? (
        <ErrorState message={(saleQuery.error as Error).message} onRetry={() => saleQuery.refetch()} />
      ) : null}

      {sale ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Receipt {sale.receiptNo} · {formatKobo(sale.totalKobo)} ·{' '}
              {new Date(sale.createdAt).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sale.status !== 'completed' ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                This sale is {sale.status}; it cannot take another return.
              </p>
            ) : null}
            {sale.customerName ? (
              <p className="text-xs text-slate-500">Customer: {sale.customerName}</p>
            ) : null}

            <Table>
              <THead>
                <TRow>
                  <TH>Item</TH>
                  <TH className="text-right">Sold</TH>
                  <TH className="text-right">Unit price</TH>
                  <TH className="text-right">Return qty</TH>
                </TRow>
              </THead>
              <tbody>
                {sale.items.map((line) => (
                  <TRow key={line.id}>
                    <TD>{line.productName}</TD>
                    <TD className="text-right tabular-nums">{line.qty}</TD>
                    <TD className="text-right tabular-nums">{formatKobo(line.unitPriceKobo)}</TD>
                    <TD className="w-28 text-right">
                      <Input
                        inputMode="numeric"
                        aria-label={`Return qty for ${line.productName}`}
                        value={qtys[line.id] ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setQtys((prev) => ({ ...prev, [line.id]: e.target.value.replace(/[^0-9]/g, '') }))
                        }
                        className="h-9 text-right"
                        disabled={sale.status !== 'completed'}
                      />
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>

            {sale.returns.length > 0 ? (
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
                <p className="font-semibold">Earlier returns on this receipt</p>
                <ul className="mt-1 space-y-1">
                  {sale.returns.map((r) => (
                    <li key={r.id}>
                      {new Date(r.createdAt).toLocaleString()} · {r.itemCount} item(s) ·{' '}
                      {formatKobo(r.refundKobo)} · {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  What should happen?
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'refund' | 'exchange')}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="refund">Refund the customer</option>
                  <option value="exchange">Exchange (swap items)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Refund method
                </label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {REFUND_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === 'cash' ? 'Cash' : m === 'transfer' ? 'Bank transfer' : 'POS'}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Reason"
                placeholder="e.g. Wrong size"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Refund preview:{' '}
                <span className="font-semibold tabular-nums">{formatKobo(refundPreview)}</span>
              </p>
              <Button
                onClick={() => returnMutation.mutate()}
                disabled={returnMutation.isPending || sale.status !== 'completed'}
              >
                <RotateCcw className="h-4 w-4" />
                {returnMutation.isPending ? 'Saving…' : kind === 'exchange' ? 'Record exchange' : 'Refund'}
              </Button>
            </div>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Recent returns</CardTitle>
          <Input
            placeholder="Search receipt…"
            aria-label="Search returns"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="h-9 w-48"
          />
        </CardHeader>
        <CardContent>
          {historyQuery.isPending ? (
            <LoadingState label="Loading returns…" />
          ) : historyQuery.isError ? (
            <ErrorState message={(historyQuery.error as Error).message} />
          ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="No returns yet" hint="Returns you record today will appear here." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH>Receipt</TH>
                  <TH>Type</TH>
                  <TH>Reason</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Refund</TH>
                  <TH>When</TH>
                </TRow>
              </THead>
              <tbody>
                {historyQuery.data?.items.map((r) => (
                  <TRow key={r.id}>
                    <TD className="font-mono text-xs">{r.receiptNo}</TD>
                    <TD>
                      <Badge
                        className={
                          r.kind === 'exchange'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        }
                      >
                        {r.kind}
                      </Badge>
                    </TD>
                    <TD>{r.reason}</TD>
                    <TD className="text-right tabular-nums">{r.itemCount}</TD>
                    <TD className="text-right tabular-nums">{formatKobo(r.refundKobo)}</TD>
                    <TD className="text-xs">{new Date(r.createdAt).toLocaleString()}</TD>
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
