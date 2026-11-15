import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Sofa, Trash2, Users, Utensils } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { RequirePermission } from '../components/RequirePermission';
import { ipc } from '../lib/ipc';
import { cn } from '../lib/cn';
import type { DiningTable } from '../types/global';

interface TableFormValues {
  name: string;
  seats: number;
  note: string;
}

const BLANK: TableFormValues = { name: '', seats: 4, note: '' };

export function TablesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiningTable | null>(null);
  const [values, setValues] = useState<TableFormValues>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tablesQuery = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const res = await ipc.tables({});
      if (!res.ok) throw new Error(res.error ?? 'Could not load tables');
      return (res.items ?? []) as DiningTable[];
    },
  });

  const invalidate = (): Promise<unknown> => queryClient.invalidateQueries({ queryKey: ['tables'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = values.name.trim();
      if (name === '') throw new Error('Give the table a name, e.g. Table 1');
      if (!Number.isInteger(values.seats) || values.seats < 1) throw new Error('Seats must be 1 or more');
      const payload = { name, seats: values.seats, note: values.note.trim() };
      const res = editing ? await ipc.tableUpdate(editing.id, payload) : await ipc.tableCreate(payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the table');
    },
    onSuccess: async () => {
      setModalOpen(false);
      setEditing(null);
      setValues(BLANK);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (args: { table: DiningTable; status: 'free' | 'occupied' }) => {
      const res = await ipc.tableSetStatus(args.table.id, { status: args.status, note: args.table.note });
      if (!res.ok) throw new Error(res.error ?? 'Could not update the table');
    },
    onSuccess: () => {
      setActionError(null);
      void invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (table: DiningTable) => {
      const res = await ipc.tableDelete(table.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not delete the table');
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

  function openEdit(table: DiningTable): void {
    setEditing(table);
    setValues({ name: table.name, seats: table.seats, note: table.note });
    setFormError(null);
    setModalOpen(true);
  }

  const tables = tablesQuery.data ?? [];
  const free = tables.filter((t) => t.status === 'free').length;
  const occupied = tables.length - free;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tables</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{free}</span> free ·{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">{occupied}</span> occupied
          </p>
        </div>
        <RequirePermission permission="sales.create">
          <Button size="lg" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New table
          </Button>
        </RequirePermission>
      </div>

      {actionError ? <ErrorState message={actionError} /> : null}

      {tablesQuery.isLoading ? <LoadingState label="Loading tables…" /> : null}
      {tablesQuery.isError ? (
        <ErrorState message={(tablesQuery.error as Error).message} onRetry={() => void tablesQuery.refetch()} />
      ) : null}
      {tablesQuery.isSuccess && tables.length === 0 ? (
        <EmptyState
          title="No tables yet"
          hint="Add your dining tables to take orders by table and track which are free."
          actionLabel="New table"
          onAction={openCreate}
        />
      ) : null}

      {tables.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {tables.map((t) => {
            const isFree = t.status === 'free';
            return (
              <Card
                key={t.id}
                className={cn(
                  'shadow-card transition-all',
                  isFree ? 'border-slate-200 dark:border-slate-700' : 'border-amber-300 dark:border-amber-700',
                )}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'grid h-9 w-9 place-items-center rounded-xl',
                          isFree
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
                        )}
                      >
                        {isFree ? <Sofa className="h-5 w-5" /> : <Utensils className="h-5 w-5" />}
                      </span>
                      <div>
                        <p className="font-bold leading-tight">{t.name}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <Users className="h-3 w-3" /> {t.seats} seats
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-bold',
                        isFree
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                      )}
                    >
                      {isFree ? 'Free' : 'Occupied'}
                    </span>
                  </div>

                  {t.note ? <p className="line-clamp-2 text-xs text-slate-500">{t.note}</p> : null}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" className="flex-1" onClick={() => navigate(`/pos?table=${t.id}`)}>
                      {isFree ? 'Start order' : 'Open order'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ table: t, status: isFree ? 'occupied' : 'free' })}
                    >
                      {isFree ? 'Mark busy' : 'Free up'}
                    </Button>
                    <RequirePermission permission="sales.create">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${t.name}`}
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </RequirePermission>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.name}` : 'New table'}
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
            label="Table name"
            placeholder="e.g. Table 1, VIP 2, Bar seat"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            autoFocus
          />
          <Input
            label="Seats"
            type="number"
            min={1}
            max={50}
            value={values.seats}
            onChange={(e) => setValues((v) => ({ ...v, seats: Number(e.target.value) }))}
          />
          <Input
            label="Note (optional)"
            placeholder="e.g. window side, high chair"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
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
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create table'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
