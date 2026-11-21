import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Tags, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { PriceTierRow, TierPriceRow } from '../types/global';

interface TierForm {
  name: string;
  description: string;
  isDefault: boolean;
}

const BLANK: TierForm = { name: '', description: '', isDefault: false };

export function PriceListsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>('');
  const [editing, setEditing] = useState<PriceTierRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TierForm>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PriceTierRow | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceError, setPriceError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const tiersQuery = useQuery({
    queryKey: ['price-tiers'],
    queryFn: async () => {
      const res = await ipc.priceTiers();
      if (!res.ok) throw new Error(res.error ?? 'Could not load price lists');
      return (res.items ?? []) as PriceTierRow[];
    },
  });

  const tiers = tiersQuery.data ?? [];
  const selected = tiers.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    const first = tiers[0];
    if (!first) return;
    if (selectedId === '') setSelectedId(first.id);
    else if (!tiers.some((t) => t.id === selectedId)) setSelectedId(first.id);
  }, [tiers, selectedId]);

  const pricesQuery = useQuery({
    queryKey: ['tier-prices', selectedId],
    enabled: selectedId !== '',
    queryFn: async () => {
      const res = await ipc.tierPrices(selectedId);
      if (!res.ok) throw new Error(res.error ?? 'Could not load the price list');
      return (res.items ?? []) as TierPriceRow[];
    },
  });

  useEffect(() => {
    if (!pricesQuery.data) return;
    const next: Record<string, string> = {};
    for (const row of pricesQuery.data) {
      next[row.productId] = row.tierPriceKobo == null ? '' : (row.tierPriceKobo / 100).toFixed(2);
    }
    setPrices(next);
    setPriceError(null);
    setNotice(null);
  }, [pricesQuery.data]);

  const visibleRows = useMemo(() => {
    const rows = pricesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.sku ?? '').toLowerCase().includes(q)
    );
  }, [pricesQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('No price list selected');
      if (form.name.trim() === '') throw new Error('Give the price list a name');
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        isDefault: form.isDefault,
      };
      const res = editing.id === ''
        ? await ipc.priceTierCreate(payload)
        : await ipc.priceTierUpdate(editing.id, payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the price list');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setEditing(null);
      setForm(BLANK);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['price-tiers'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (tier: PriceTierRow) => {
      const res = await ipc.priceTierDelete(tier.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not delete the price list');
    },
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: ['price-tiers'] });
    },
    onError: (e: Error) => {
      setDeleting(null);
      setPriceError(e.message);
    },
  });

  const pricesMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Choose a price list');
      const rows: Array<{ productId: string; priceKobo: number }> = [];
      for (const [productId, raw] of Object.entries(prices)) {
        const text = raw.trim();
        if (text === '') continue;
        const priceKobo = parseNairaToKobo(text);
        if (priceKobo === null) throw new Error('Prices must be amounts like 1250.00');
        rows.push({ productId, priceKobo });
      }
      const res = await ipc.tierPricesSet(selected.id, { prices: rows });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the prices');
      return res.saved ?? rows.length;
    },
    onSuccess: async (saved) => {
      setPriceError(null);
      setNotice(`${saved} price override${saved === 1 ? '' : 's'} saved.`);
      await queryClient.invalidateQueries({ queryKey: ['tier-prices', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['price-tiers'] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setPriceError(e.message);
    },
  });

  function openCreate(): void {
    setEditing({ id: '', name: '', description: '', isDefault: false, customerCount: 0, priceCount: 0 });
    setForm(BLANK);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(tier: PriceTierRow): void {
    setEditing(tier);
    setForm({ name: tier.name, description: tier.description, isDefault: tier.isDefault });
    setFormError(null);
    setModalOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Price Lists</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Wholesale tiers and customer prices. A customer on a tier is charged that tier's price at the till.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New price list
        </Button>
      </div>

      {tiersQuery.isPending ? (
        <LoadingState label="Loading price lists…" />
      ) : tiersQuery.isError ? (
        <ErrorState message={(tiersQuery.error as Error).message} />
      ) : tiers.length === 0 ? (
        <EmptyState
          title="No price lists yet"
          hint="Create a wholesale tier, then assign customers to it."
          actionLabel="New price list"
          onAction={openCreate}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Tiers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tiers.map((tier) => (
                <div
                  key={tier.id}
                  className={`rounded-xl border p-3 ${
                    tier.id === selectedId
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-950/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <button type="button" className="block w-full text-left" onClick={() => setSelectedId(tier.id)}>
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {tier.name}
                      {tier.isDefault ? <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">Default</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {tier.customerCount} customer{tier.customerCount === 1 ? '' : 's'} · {tier.priceCount} price
                      {tier.priceCount === 1 ? '' : 's'} set
                    </span>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(tier)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(tier)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Tags className="h-4 w-4" /> {selected?.name ?? 'Prices'}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filter products…"
                  aria-label="Filter products"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-48"
                />
                <Button size="sm" onClick={() => pricesMutation.mutate()} disabled={pricesMutation.isPending}>
                  <Save className="h-3.5 w-3.5" /> {pricesMutation.isPending ? 'Saving…' : 'Save prices'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leave a price blank to keep the normal selling price. Overrides apply when the cashier does not type
                a price.
              </p>
              {priceError ? <p className="text-sm text-red-600">{priceError}</p> : null}
              {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
              {pricesQuery.isPending ? (
                <LoadingState label="Loading products…" />
              ) : pricesQuery.isError ? (
                <ErrorState message={(pricesQuery.error as Error).message} />
              ) : visibleRows.length === 0 ? (
                <EmptyState title="No products match" />
              ) : (
                <Table>
                  <THead>
                    <TRow>
                      <TH>Product</TH>
                      <TH className="text-right">Retail</TH>
                      <TH className="text-right">Tier price</TH>
                    </TRow>
                  </THead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <TRow key={row.productId}>
                        <TD>
                          <span className="font-medium">{row.name}</span>
                          {row.sku ? <span className="ml-2 text-xs text-slate-400">{row.sku}</span> : null}
                        </TD>
                        <TD className="text-right tabular-nums text-slate-500">
                          {formatKobo(row.sellingPriceKobo)}
                        </TD>
                        <TD className="w-40">
                          <Input
                            aria-label={`Tier price for ${row.name}`}
                            inputMode="decimal"
                            placeholder={(row.sellingPriceKobo / 100).toFixed(2)}
                            value={prices[row.productId] ?? ''}
                            onChange={(e) =>
                              setPrices((prev) => ({ ...prev, [row.productId]: e.target.value }))
                            }
                            className="h-9 text-right"
                          />
                        </TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editing?.id === '' ? 'New price list' : 'Edit price list'}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-3">
          <Input
            label="Name"
            placeholder="e.g. Wholesale, VIP, Retail"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
            />
            Make this the default list for new customers
          </label>
          {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete price list?"
        message={
          deleting
            ? `${deleting.name} will be removed. Lists still assigned to customers cannot be deleted.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
