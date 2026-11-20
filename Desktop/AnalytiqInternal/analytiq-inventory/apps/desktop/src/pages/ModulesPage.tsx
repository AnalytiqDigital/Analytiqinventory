import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Boxes, Check } from 'lucide-react';
import { resolveModules, type OptionalModule } from '@analytiq/validation';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ErrorState, LoadingState } from '../components/ui/states';
import { ipc } from '../lib/ipc';
import { useSession } from '../stores/session';

const MODULE_INFO: Record<OptionalModule, { label: string; blurb: string }> = {
  tables: { label: 'Tables', blurb: 'Dine-in tables for restaurants and bars.' },
  taxCategories: { label: 'Tax categories', blurb: 'VAT and other tax rates per product.' },
  purchases: { label: 'Purchases', blurb: 'Buy stock from suppliers and receive it into inventory.' },
  suppliers: { label: 'Suppliers', blurb: 'Keep supplier records for purchases.' },
  customers: { label: 'Customers & credit', blurb: 'Customer records, credit limits and debtors.' },
  finance: { label: 'Finance', blurb: 'Expenses and net profit alongside sales.' },
  expiry: { label: 'Batches & expiry', blurb: 'Batch numbers, expiry dates and near-expiry alerts.' },
  priceTiers: { label: 'Price lists', blurb: 'Wholesale price tiers per customer.' },
  loyalty: { label: 'Loyalty points', blurb: 'Earn and redeem points on customer sales.' },
  returns: { label: 'Returns', blurb: 'Refund or exchange by receipt at the counter.' },
  transfers: { label: 'Stock transfers', blurb: 'Move stock between branches.' },
};

const MODULE_ORDER: OptionalModule[] = [
  'tables',
  'expiry',
  'priceTiers',
  'loyalty',
  'returns',
  'transfers',
  'customers',
  'purchases',
  'suppliers',
  'taxCategories',
  'finance',
];

export function ModulesPage(): JSX.Element {
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const refresh = useSession((s) => s.refresh);

  const viewQuery = useQuery({
    queryKey: ['modules-view'],
    queryFn: async () => {
      const res = await ipc.modulesView();
      if (!res.ok) throw new Error(res.error ?? 'Could not load modules');
      return {
        businessType: res.businessType ?? 'other',
        modules: res.modules ?? [],
      };
    },
  });

  useEffect(() => {
    if (!viewQuery.data || ready) return;
    setDraft(new Set(viewQuery.data.modules));
    setReady(true);
  }, [viewQuery.data, ready]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const type = viewQuery.data?.businessType ?? 'other';
      const defaults = resolveModules(type);
      const overrides: Record<string, boolean> = {};
      for (const module of Object.keys(MODULE_INFO) as OptionalModule[]) {
        const on = draft.has(module);
        if (on !== defaults.has(module)) overrides[module] = on;
      }
      const res = await ipc.modulesSet({ overrides });
      if (!res.ok) throw new Error(res.error ?? 'Could not save modules');
      return (res.modules ?? []) as string[];
    },
    onSuccess: async () => {
      setSaved(true);
      setError(null);
      await refresh();
      void viewQuery.refetch();
    },
    onError: (e: Error) => {
      setSaved(false);
      setError(e.message);
    },
  });

  function toggle(module: OptionalModule): void {
    setSaved(false);
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Install modules</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Switch features on or off for this business. The menu and screens update after saving.
        </p>
      </div>

      {viewQuery.isPending ? (
        <LoadingState label="Loading modules…" />
      ) : viewQuery.isError ? (
        <ErrorState message={(viewQuery.error as Error).message} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Modules for a {viewQuery.data.businessType} business
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULE_ORDER.map((module) => {
                const info = MODULE_INFO[module];
                const on = draft.has(module);
                return (
                  <button
                    key={module}
                    type="button"
                    onClick={() => toggle(module)}
                    aria-pressed={on}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                      on
                        ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/40'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        on
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{info.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{info.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {saved ? <p className="text-sm text-emerald-600">Saved. The menu now matches your choice.</p> : null}
            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : 'Save modules'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
