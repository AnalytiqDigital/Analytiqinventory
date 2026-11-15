import { productSchema, type ProductInput } from '@analytiq/validation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import { IMAGE_ACCEPT, ProductThumb, generateEan13, readImageFile } from '../lib/product-media';
import type { Category, ProductRow, TaxCategory } from '../types/global';

interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  taxCategoryId: string;
  imagePath: string;
  unit: string;
  costPrice: string;
  sellingPrice: string;
  reorderLevel: number;
  openingStock: number;
}

function toForm(p?: ProductRow): ProductFormValues {
  return {
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    categoryId: p?.categoryId ?? '',
    taxCategoryId: p?.taxCategoryId ?? '',
    imagePath: p?.imagePath ?? '',
    unit: p?.unit ?? 'pcs',
    costPrice: p ? (p.costPriceKobo / 100).toFixed(2) : '0.00',
    sellingPrice: p ? (p.sellingPriceKobo / 100).toFixed(2) : '0.00',
    reorderLevel: p?.reorderLevel ?? 0,
    openingStock: 0,
  };
}

/** 7.5% (750 bps) → "7.5%". Whole rates lose the decimal point. */
function formatRate(rateBps: number): string {
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0$/, '')}%`;
}

export function ProductsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const productsQuery = useQuery({
    queryKey: ['products', debounced, categoryId, includeInactive, page],
    queryFn: async () => {
      const res = await ipc.products({
        search: debounced,
        categoryId: categoryId || null,
        includeInactive,
        page,
        pageSize: 25,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load products');
      return res as { items: ProductRow[]; total: number };
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await ipc.categories();
      if (!res.ok) throw new Error(res.error ?? 'Could not load categories');
      return (res.items ?? []) as Category[];
    },
  });

  // Named tax categories (Food 7.5%, Alcohol 10%, Exempt 0% for a restaurant).
  const taxQuery = useQuery({
    queryKey: ['tax-categories'],
    queryFn: async () => {
      const res = await ipc.taxCategories();
      if (!res.ok) throw new Error(res.error ?? 'Could not load tax categories');
      return (res.items ?? []) as TaxCategory[];
    },
  });

  const form = useForm<ProductFormValues>({
    defaultValues: toForm(),
  });

  const validateForm = (values: ProductFormValues): string | null => {
    const core = productSchema
      .omit({
        sku: true,
        barcode: true,
        categoryId: true,
        taxCategoryId: true,
        imagePath: true,
        costPriceKobo: true,
        sellingPriceKobo: true,
        openingStock: true,
      })
      .safeParse({
        name: values.name,
        unit: values.unit.trim() || 'pcs',
        reorderLevel: values.reorderLevel,
      });
    if (!core.success) return core.error.issues[0]?.message ?? 'Check the highlighted fields';
    if (parseNairaToKobo(values.costPrice) == null) return 'Cost price is not a valid amount';
    if (parseNairaToKobo(values.sellingPrice) == null) return 'Selling price is not a valid amount';
    if (!editing && (!Number.isInteger(values.openingStock) || values.openingStock < 0)) {
      return 'Opening stock must be a whole number';
    }
    return null;
  };

  useEffect(() => {
    form.reset(toForm(editing ?? undefined));
    setImageError(null);
  }, [editing, modalOpen, form]);

  const invalidate = (): Promise<unknown> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['levels'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-products'] }),
    ]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues & { isEdit: boolean; id?: string }) => {
      const cost = parseNairaToKobo(values.costPrice);
      const sell = parseNairaToKobo(values.sellingPrice);
      if (cost == null) throw new Error('Cost price is not a valid amount');
      if (sell == null) throw new Error('Selling price is not a valid amount');
      const base: ProductInput & { locationId?: string | null } = {
        name: values.name,
        sku: values.sku.trim() === '' ? null : values.sku.trim(),
        barcode: values.barcode.trim() === '' ? null : values.barcode.trim(),
        categoryId: values.categoryId === '' ? null : values.categoryId,
        taxCategoryId: values.taxCategoryId === '' ? null : values.taxCategoryId,
        imagePath: values.imagePath,
        unit: values.unit.trim() || 'pcs',
        costPriceKobo: cost,
        sellingPriceKobo: sell,
        reorderLevel: values.reorderLevel,
        openingStock: values.isEdit ? 0 : values.openingStock,
      };
      if (values.isEdit && values.id) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { openingStock, ...patch } = base;
        const res = await ipc.productUpdate(values.id, patch);
        if (!res.ok) throw new Error(res.error ?? 'Update failed');
      } else {
        const res = await ipc.productCreate(base);
        if (!res.ok) throw new Error(res.error ?? 'Create failed');
      }
    },
    onSuccess: () => {
      setModalOpen(false);
      setEditing(null);
      void invalidate();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (row: ProductRow) => {
      const res = row.isActive === 1 ? await ipc.productArchive(row.id) : await ipc.productRestore(row.id);
      if (!res.ok) throw new Error(res.error ?? 'Operation failed');
    },
    onSuccess: () => void invalidate(),
  });

  async function onPickImage(file: File | undefined): Promise<void> {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const dataUrl = await readImageFile(file);
      form.setValue('imagePath', dataUrl, { shouldDirty: true });
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'Could not process that image');
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const items = productsQuery.data?.items ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const taxCategories = taxQuery.data ?? [];
  const defaultTaxId = taxCategories.find((t) => t.isDefault)?.id ?? '';
  const imagePath = form.watch('imagePath');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <span className="font-semibold text-brand-600 dark:text-brand-300">{total}</span> in catalogue
          </p>
        </div>
        <RequirePermission permission="products.manage">
          <Button
            size="lg"
            onClick={() => {
              setEditing(null);
              form.reset(toForm());
              setModalOpen(true);
            }}
          >
            + New product
          </Button>
        </RequirePermission>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-52 flex-1">
              <Input
                aria-label="Search products"
                placeholder="Search name, SKU, barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter by category"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {(categoriesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => {
                  setIncludeInactive(e.target.checked);
                  setPage(1);
                }}
              />
              Show archived
            </label>
          </div>
        </CardContent>
      </Card>

      {productsQuery.isLoading ? <LoadingState label="Loading products…" /> : null}
      {productsQuery.isError ? (
        <ErrorState message={(productsQuery.error as Error).message} onRetry={() => void productsQuery.refetch()} />
      ) : null}
      {productsQuery.isSuccess && items.length === 0 ? (
        <EmptyState
          title="No products yet"
          hint="Create your first product to start tracking stock."
          actionLabel="New product"
          onAction={() => {
            setEditing(null);
            form.reset(toForm());
            setModalOpen(true);
          }}
        />
      ) : null}
      {productsQuery.isSuccess && items.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <THead>
                <TRow>
                  <TH>Product</TH>
                  <TH>SKU / Barcode</TH>
                  <TH>Price</TH>
                  <TH>Tax</TH>
                  <TH>Stock</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((p) => (
                  <TRow key={p.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <ProductThumb imagePath={p.imagePath} name={p.name} />
                        <div className="min-w-0">
                          <Link
                            to={`/products/${p.id}`}
                            className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-white"
                          >
                            {p.name}
                          </Link>
                          {p.categoryName ? <p className="text-xs text-slate-500">{p.categoryName}</p> : null}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <p className="text-sm">{p.sku ?? '—'}</p>
                      {p.barcode ? <p className="font-mono text-[11px] text-slate-500">{p.barcode}</p> : null}
                    </TD>
                    <TD>{formatKobo(p.sellingPriceKobo)}</TD>
                    <TD>
                      {(() => {
                        const cat = taxCategories.find((t) => t.id === p.taxCategoryId);
                        if (cat) {
                          return (
                            <span className="text-sm">
                              {cat.name}{' '}
                              <span className="text-xs text-slate-500">({formatRate(cat.rateBps)})</span>
                            </span>
                          );
                        }
                        return <span className="text-xs text-slate-500">Default</span>;
                      })()}
                    </TD>
                    <TD>
                      <span className="font-semibold tabular-nums">
                        {p.onHand} {p.unit}
                      </span>
                      {p.lowStock ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Low stock
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      {p.isActive === 1 ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Archived
                        </span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <RequirePermission permission="products.manage">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditing(p);
                              setModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={archiveMutation.isPending}
                            onClick={() => archiveMutation.mutate(p)}
                          >
                            {p.isActive === 1 ? 'Archive' : 'Restore'}
                          </Button>
                        </RequirePermission>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.name}` : 'New product'}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          saveMutation.reset();
        }}
      >
        <form
          onSubmit={form.handleSubmit((values) => {
            const problem = validateForm(values);
            if (problem) {
              form.setError('name', { message: problem });
              return;
            }
            saveMutation.mutate({ ...values, isEdit: Boolean(editing), id: editing?.id });
          })}
          className="space-y-3"
        >
          {/* Photo + identity */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <ProductThumb imagePath={imagePath} name={form.watch('name') || 'Product'} size="lg" />
              {imagePath ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline"
                  onClick={() => form.setValue('imagePath', '', { shouldDirty: true })}
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              ) : null}
            </div>
            <div className="flex-1">
              <Input label="Name" {...form.register('name')} error={form.formState.errors.name?.message} />
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => void onPickImage(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={imageBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {imageBusy ? 'Processing…' : imagePath ? 'Replace photo' : 'Upload photo'}
                </Button>
                <span className="text-[11px] text-slate-500">Stored offline on this device</span>
              </div>
              {imageError ? <p className="mt-1 text-xs font-medium text-red-600">{imageError}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU (optional)" {...form.register('sku')} />
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="product-barcode">
                Barcode (optional)
              </label>
              <div className="flex gap-2">
                <Input id="product-barcode" className="flex-1" {...form.register('barcode')} />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  title="Generate an EAN-13 barcode"
                  onClick={() => form.setValue('barcode', generateEan13(), { shouldDirty: true })}
                >
                  <Sparkles className="h-4 w-4" />
                  Generate
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="product-unit">
                Unit
              </label>
              <Input id="product-unit" {...form.register('unit')} error={form.formState.errors.unit?.message} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" htmlFor="product-category">
                Category
              </label>
              <select
                id="product-category"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                {...form.register('categoryId')}
              >
                <option value="">No category</option>
                {(categoriesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium" htmlFor="product-tax">
              Tax category
            </label>
            <select
              id="product-tax"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              {...form.register('taxCategoryId')}
            >
              <option value="">
                Business default{defaultTaxId ? '' : ' (tax)'}
              </option>
              {taxCategories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {formatRate(t.rateBps)}
                  {t.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Used to compute tax on each sale line. Exempt items should use a 0% category.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Cost price (₦)" placeholder="0.00" {...form.register('costPrice')} />
            <Input label="Selling price (₦)" placeholder="0.00" {...form.register('sellingPrice')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Reorder level"
              type="number"
              min={0}
              {...form.register('reorderLevel', { valueAsNumber: true })}
              error={form.formState.errors.reorderLevel?.message}
            />
            {editing ? null : (
              <Input
                label="Opening stock"
                type="number"
                min={0}
                {...form.register('openingStock', { valueAsNumber: true })}
                error={form.formState.errors.openingStock?.message}
              />
            )}
          </div>
          {saveMutation.isError ? <ErrorState message={(saveMutation.error as Error).message} /> : null}
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
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
