import { productSchema, type ProductInput } from '@analytiq/validation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { Category, ProductRow } from '../types/global';

interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
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
    unit: p?.unit ?? 'pcs',
    costPrice: p ? (p.costPriceKobo / 100).toFixed(2) : '0.00',
    sellingPrice: p ? (p.sellingPriceKobo / 100).toFixed(2) : '0.00',
    reorderLevel: p?.reorderLevel ?? 0,
    openingStock: 0,
  };
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

  const form = useForm<ProductFormValues>({
    defaultValues: toForm(),
  });

  const validateForm = (values: ProductFormValues): string | null => {
    const core = productSchema
      .omit({ sku: true, barcode: true, categoryId: true, costPriceKobo: true, sellingPriceKobo: true, openingStock: true })
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
  }, [editing, modalOpen, form]);

  const invalidate = (): Promise<unknown> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['levels'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
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

  const items = productsQuery.data?.items ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Products</h1>
          <Badge>{total} total</Badge>
        </div>
        <RequirePermission permission="products.manage">
          <Button
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
                  <TH>Name</TH>
                  <TH>SKU</TH>
                  <TH>Price</TH>
                  <TH>Stock</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((p) => (
                  <TRow key={p.id}>
                    <TD>
                      <Link to={`/products/${p.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-white">
                        {p.name}
                      </Link>
                      {p.categoryName ? <span className="ml-2 text-xs text-slate-500">{p.categoryName}</span> : null}
                    </TD>
                    <TD>{p.sku ?? '—'}</TD>
                    <TD>{formatKobo(p.sellingPriceKobo)}</TD>
                    <TD>
                      {p.onHand} {p.unit}
                      {p.lowStock ? <Badge className="ml-2">Low</Badge> : null}
                    </TD>
                    <TD>{p.isActive === 1 ? 'Active' : 'Archived'}</TD>
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
          <Input label="Name" {...form.register('name')} error={form.formState.errors.name?.message} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU (optional)" {...form.register('sku')} />
            <Input label="Barcode (optional)" {...form.register('barcode')} />
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
          {saveMutation.isError ? (
            <ErrorState message={(saveMutation.error as Error).message} />
          ) : null}
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
