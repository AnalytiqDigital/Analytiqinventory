import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import { TAX_CATEGORIES_KEY, fetchTaxCategories } from '../lib/taxCategories';
import type { TaxCategory } from '../types/global';

function formatRate(rateBps: number): string {
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, '')}%`;
}

/** "7.5" or "7.5%" → 750 basis points. Returns null when the entry is not a valid rate. */
function parseRate(input: string): number | null {
  const cleaned = input.replace('%', '').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

interface CategoryDraft {
  name: string;
  rate: string;
  isDefault: boolean;
}

const BLANK: CategoryDraft = { name: '', rate: '0', isDefault: false };

export function TaxCategoriesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxCategory | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);

  const taxQuery = useQuery({
    queryKey: TAX_CATEGORIES_KEY,
    queryFn: fetchTaxCategories,
  });

  const invalidate = (): Promise<unknown> =>
    queryClient.invalidateQueries({ queryKey: TAX_CATEGORIES_KEY });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      if (name === '') throw new Error('Give the category a name, e.g. Food or Alcohol');
      const rateBps = parseRate(draft.rate);
      if (rateBps == null) throw new Error('Rate must be a percentage between 0 and 100');
      const payload = { name, rateBps, isDefault: draft.isDefault };
      const res = editing ? await ipc.taxCategoryUpdate(editing.id, payload) : await ipc.taxCategoryCreate(payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the tax category');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setEditing(null);
      setDraft(BLANK);
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function openCreate(): void {
    setEditing(null);
    setDraft(BLANK);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(category: TaxCategory): void {
    setEditing(category);
    setDraft({
      name: category.name,
      rate: (category.rateBps / 100).toString(),
      isDefault: category.isDefault,
    });
    setFormError(null);
    setModalOpen(true);
  }

  const categories = taxQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tax categories</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Named rates applied per product. A restaurant typically uses Food 7.5%, Alcohol 10% and Exempt 0%.
          </p>
        </div>
        <RequirePermission permission="settings.manage">
          <Button size="lg" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New category
          </Button>
        </RequirePermission>
      </div>

      {taxQuery.isLoading ? <LoadingState label="Loading tax categories…" /> : null}
      {taxQuery.isError ? (
        <ErrorState message={(taxQuery.error as Error).message} onRetry={() => void taxQuery.refetch()} />
      ) : null}
      {taxQuery.isSuccess && categories.length === 0 ? (
        <EmptyState
          title="No tax categories"
          hint="Create Food, Alcohol and Exempt rates to price products correctly."
          actionLabel="New category"
          onAction={openCreate}
        />
      ) : null}

      {categories.length > 0 ? (
        <Card>
          <CardContent>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">
                      {c.name}
                      {c.isDefault ? (
                        <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-500">{formatRate(c.rateBps)} tax</p>
                  </div>
                  <RequirePermission permission="settings.manage">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                  </RequirePermission>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.name}` : 'New tax category'}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          saveMutation.reset();
        }}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            saveMutation.mutate();
          }}
        >
          <Input
            label="Name"
            placeholder="e.g. Food, Alcohol, Exempt"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            autoFocus
          />
          <Input
            label="Rate (%)"
            inputMode="decimal"
            placeholder="7.5"
            value={draft.rate}
            onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={draft.isDefault}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
            />
            Use as the default for products without a tax category
          </label>
          {formError ? <ErrorState message={formError} /> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create category'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
