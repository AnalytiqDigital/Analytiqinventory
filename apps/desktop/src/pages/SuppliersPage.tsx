import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RotateCcw, Trash2, Truck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import type { SupplierRow } from '../types/global';

const PAGE_SIZE = 50;

interface SupplierFormValues {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

const BLANK: SupplierFormValues = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  note: '',
};

function toForm(s?: SupplierRow): SupplierFormValues {
  return {
    name: s?.name ?? '',
    contactName: s?.contactName ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    address: s?.address ?? '',
    note: s?.note ?? '',
  };
}

export function SuppliersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [values, setValues] = useState<SupplierFormValues>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', debounced, includeInactive, page],
    queryFn: async () => {
      const res = await ipc.suppliers({
        search: debounced,
        includeInactive,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load suppliers');
      return res as { items: SupplierRow[]; total: number };
    },
  });

  const invalidate = (): Promise<unknown> =>
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = values.name.trim();
      if (name === '') throw new Error('Give the supplier a name');
      const payload = {
        name,
        contactName: values.contactName.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        address: values.address.trim(),
        note: values.note.trim(),
      };
      const res = editing
        ? await ipc.suppliersUpdate(editing.id, payload)
        : await ipc.suppliersCreate(payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the supplier');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setEditing(null);
      setValues(BLANK);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (supplier: SupplierRow) => {
      const res = supplier.isActive
        ? await ipc.suppliersArchive(supplier.id)
        : await ipc.suppliersUpdate(supplier.id, { isActive: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not update the supplier');
    },
    onSuccess: () => {
      setActionError(null);
      void invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  function openCreate(): void {
    setEditing(null);
    setValues(BLANK);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(supplier: SupplierRow): void {
    setEditing(supplier);
    setValues(toForm(supplier));
    setFormError(null);
    setModalOpen(true);
  }

  const items = suppliersQuery.data?.items ?? [];
  const total = suppliersQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Who you buy stock from.</p>
        </div>
        <RequirePermission permission="suppliers.manage">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New supplier
          </Button>
        </RequirePermission>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat icon={Truck} label="Suppliers" value={String(total)} tone="brand" />
        <Stat
          icon={Truck}
          label="Active on this page"
          value={String(items.filter((s) => s.isActive).length)}
          tone="emerald"
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              aria-label="Search suppliers"
              placeholder="Search by name or contact…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
        </CardContent>
      </Card>

      {actionError ? <ErrorState message={actionError} /> : null}

      {suppliersQuery.isLoading ? <LoadingState label="Loading suppliers…" /> : null}
      {suppliersQuery.isError ? (
        <ErrorState
          message={(suppliersQuery.error as Error).message}
          onRetry={() => void suppliersQuery.refetch()}
        />
      ) : null}
      {suppliersQuery.isSuccess && items.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          hint="Add a supplier so you can record purchases and receive stock."
          actionLabel="New supplier"
          onAction={openCreate}
        />
      ) : null}
      {suppliersQuery.isSuccess && items.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <THead>
                <TRow>
                  <TH>Supplier</TH>
                  <TH>Contact</TH>
                  <TH>Purchases</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((s) => (
                  <TRow key={s.id}>
                    <TD>
                      <p className="font-medium text-slate-900 dark:text-white">{s.name}</p>
                      {s.address ? <p className="text-xs text-slate-500">{s.address}</p> : null}
                    </TD>
                    <TD>
                      <p className="text-sm">{s.contactName || '—'}</p>
                      {s.phone ? <p className="text-xs text-slate-500">{s.phone}</p> : null}
                      {s.email ? <p className="text-xs text-slate-500">{s.email}</p> : null}
                    </TD>
                    <TD className="tabular-nums">{s.purchaseCount}</TD>
                    <TD>
                      <Badge
                        className={
                          s.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {s.isActive ? 'Active' : 'Archived'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <RequirePermission permission="suppliers.manage">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${s.name}`}
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={s.isActive ? `Archive ${s.name}` : `Restore ${s.name}`}
                            disabled={archiveMutation.isPending}
                            onClick={() => archiveMutation.mutate(s)}
                          >
                            {s.isActive ? (
                              <Trash2 className="h-4 w-4" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                          </Button>
                        </RequirePermission>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
            {total > PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= Math.ceil(total / PAGE_SIZE)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.name}` : 'New supplier'}
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
            label="Supplier name"
            placeholder="e.g. Lagos Wholesale Ltd"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            autoFocus
          />
          <Input
            label="Contact person (optional)"
            value={values.contactName}
            onChange={(e) => setValues((v) => ({ ...v, contactName: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Phone (optional)"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            />
            <Input
              label="Email (optional)"
              type="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            />
          </div>
          <Input
            label="Address (optional)"
            value={values.address}
            onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
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
              {saveMutation.isPending ? 'Saving…' : 'Save supplier'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
