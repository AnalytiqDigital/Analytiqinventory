import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Stat } from '../components/ui/stat';
import { ipc } from '../lib/ipc';
import { formatKobo } from '../lib/money';
import type { DebtorReminderResult, DebtorRow } from '../types/global';

export function DebtorsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<DebtorReminderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debtorsQuery = useQuery({
    queryKey: ['debtors', search],
    queryFn: async () => {
      const res = await ipc.debtors({ search: search.trim() });
      if (!res.ok) throw new Error(res.error ?? 'Could not load debtors');
      return res as { items: DebtorRow[]; totalKobo: number };
    },
  });

  const rows = useMemo(() => debtorsQuery.data?.items ?? [], [debtorsQuery.data]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.customerId));

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.customerId)));
  }

  const remindMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const ids = [...selected];
      const res = await ipc.debtorRemind({
        customerIds: ids.length > 0 ? ids : undefined,
        dryRun,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not send reminders');
      return res.result as DebtorReminderResult;
    },
    onSuccess: async (r) => {
      setResult(r);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['debtors'] });
    },
    onError: (e: Error) => {
      setResult(null);
      setError(e.message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Debtors</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Customers who still owe on credit sales. Remind them politely on WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => remindMutation.mutate(true)}
            disabled={remindMutation.isPending || rows.length === 0}
          >
            Preview message
          </Button>
          <Button onClick={() => remindMutation.mutate(false)} disabled={remindMutation.isPending || rows.length === 0}>
            <Send className="h-4 w-4" />
            {remindMutation.isPending
              ? 'Sending…'
              : selected.size > 0
                ? `Remind ${selected.size} selected`
                : 'Remind all'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat icon={BellRing} label="Debtors" value={String(rows.length)} tone="amber" />
        <Stat
          icon={BellRing}
          label="Total owed"
          value={formatKobo(debtorsQuery.data?.totalKobo ?? 0)}
          tone="violet"
        />
      </div>

      {error ? <ErrorState message={error} /> : null}
      {result ? (
        <Card>
          <CardContent className="text-sm">
            <p className="font-semibold">
              {result.dryRun > 0 ? 'Preview (nothing was sent)' : 'Reminders sent'}
            </p>
            <p className="text-slate-600 dark:text-slate-300">
              Attempted {result.attempted} · sent {result.sent} · preview {result.dryRun} · failed{' '}
              {result.failed} · skipped {result.skipped}
            </p>
            {result.errors.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-red-600">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              WhatsApp credentials live in Settings → WhatsApp &amp; AI. Without them, messages are saved as a
              preview only.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Who owes</CardTitle>
          <Input
            placeholder="Search name or phone…"
            aria-label="Search debtors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
        </CardHeader>
        <CardContent>
          {debtorsQuery.isPending ? (
            <LoadingState label="Loading debtors…" />
          ) : debtorsQuery.isError ? (
            <ErrorState message={(debtorsQuery.error as Error).message} />
          ) : rows.length === 0 ? (
            <EmptyState title="Nobody owes you" hint="Credit sales that are not fully paid appear here." />
          ) : (
            <Table>
              <THead>
                <TRow>
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all debtors"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </TH>
                  <TH>Customer</TH>
                  <TH>Phone</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Last reminder</TH>
                </TRow>
              </THead>
              <tbody>
                {rows.map((row) => (
                  <TRow key={row.customerId}>
                    <TD>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected.has(row.customerId)}
                        onChange={() => toggle(row.customerId)}
                      />
                    </TD>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="text-xs">{row.phone || '—'}</TD>
                    <TD className="text-right tabular-nums font-semibold">{formatKobo(row.balanceKobo)}</TD>
                    <TD className="text-xs">
                      {row.lastReminderAt ? new Date(row.lastReminderAt).toLocaleString() : 'Never'}
                    </TD>
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
