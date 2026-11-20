import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, NotebookPen, Pencil, Plus, RotateCcw, Sparkles, Trash2, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { RequirePermission } from '../components/RequirePermission';
import { hasModule } from '../components/layout/nav';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import { useSession } from '../stores/session';
import type {
  CustomerNoteRow,
  CustomerPaymentRow,
  CustomerRow,
  LoyaltyEntryRow,
  PriceTierRow,
} from '../types/global';

const PAGE_SIZE = 50;

interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  creditLimit: string;
  priceTierId: string;
}

const BLANK: CustomerFormValues = {
  name: '',
  phone: '',
  email: '',
  address: '',
  note: '',
  creditLimit: '0.00',
  priceTierId: '',
};

function toForm(c?: CustomerRow): CustomerFormValues {
  return {
    name: c?.name ?? '',
    phone: c?.phone ?? '',
    email: c?.email ?? '',
    address: c?.address ?? '',
    note: c?.note ?? '',
    creditLimit: c ? (c.creditLimitKobo / 100).toFixed(2) : '0.00',
    priceTierId: c?.priceTierId ?? '',
  };
}

export function CustomersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [values, setValues] = useState<CustomerFormValues>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paying, setPaying] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<CustomerRow | null>(null);
  const [profile, setProfile] = useState<CustomerRow | null>(null);
  const businessType = useSession((s) => s.user?.businessType);
  const modules = useSession((s) => s.user?.modules);
  const tiersEnabled = hasModule(businessType, 'priceTiers', modules);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const customersQuery = useQuery({
    queryKey: ['customers', debounced, includeInactive, page],
    queryFn: async () => {
      const res = await ipc.customers({
        search: debounced,
        includeInactive,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load customers');
      return res as { items: CustomerRow[]; total: number };
    },
  });

  const tiersQuery = useQuery({
    queryKey: ['price-tiers', 'for-customer'],
    enabled: tiersEnabled,
    queryFn: async () => {
      const res = await ipc.priceTiers();
      if (!res.ok) throw new Error(res.error ?? 'Could not load price lists');
      return (res.items ?? []) as PriceTierRow[];
    },
  });

  const invalidate = (): Promise<unknown> =>
    queryClient.invalidateQueries({ queryKey: ['customers'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = values.name.trim();
      if (name === '') throw new Error('Give the customer a name');
      const creditLimitKobo = parseNairaToKobo(
        values.creditLimit.trim() === '' ? '0' : values.creditLimit
      );
      if (creditLimitKobo === null) throw new Error('Credit limit must be an amount like 5000.00');
      const payload = {
        name,
        phone: values.phone.trim(),
        email: values.email.trim(),
        address: values.address.trim(),
        note: values.note.trim(),
        creditLimitKobo,
        priceTierId: values.priceTierId || null,
      };
      const res = editing
        ? await ipc.customersUpdate(editing.id, payload)
        : await ipc.customersCreate(payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the customer');
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
    mutationFn: async (customer: CustomerRow) => {
      const res = customer.isActive
        ? await ipc.customersArchive(customer.id)
        : await ipc.customersUpdate(customer.id, { isActive: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not update the customer');
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

  function openEdit(customer: CustomerRow): void {
    setEditing(customer);
    setValues(toForm(customer));
    setFormError(null);
    setModalOpen(true);
  }

  const items = customersQuery.data?.items ?? [];
  const total = customersQuery.data?.total ?? 0;
  const owing = items.filter((c) => c.balanceKobo > 0);
  const outstanding = owing.reduce((sum, c) => sum + c.balanceKobo, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Credit customers, their limits and what they still owe you.
          </p>
        </div>
        <RequirePermission permission="customers.manage">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New customer
          </Button>
        </RequirePermission>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Customers" value={String(total)} tone="brand" />
        <Stat
          icon={Banknote}
          label="Owing on this page"
          value={String(owing.length)}
          tone="amber"
        />
        <Stat
          icon={Banknote}
          label="Outstanding (this page)"
          value={formatKobo(outstanding)}
          tone="emerald"
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              aria-label="Search customers"
              placeholder="Search by name or phone…"
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

      {customersQuery.isLoading ? <LoadingState label="Loading customers…" /> : null}
      {customersQuery.isError ? (
        <ErrorState
          message={(customersQuery.error as Error).message}
          onRetry={() => void customersQuery.refetch()}
        />
      ) : null}
      {customersQuery.isSuccess && items.length === 0 ? (
        <EmptyState
          title="No customers yet"
          hint="Add a customer to sell on credit and track what they owe."
          actionLabel="New customer"
          onAction={openCreate}
        />
      ) : null}
      {customersQuery.isSuccess && items.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <THead>
                <TRow>
                  <TH>Customer</TH>
                  <TH>Contact</TH>
                  <TH>Credit limit</TH>
                  <TH>Owing</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </TRow>
              </THead>
              <tbody>
                {items.map((c) => (
                  <TRow key={c.id}>
                    <TD>
                      <p className="font-medium text-slate-900 dark:text-white">{c.name}</p>
                      {c.address ? <p className="text-xs text-slate-500">{c.address}</p> : null}
                    </TD>
                    <TD>
                      <p className="text-sm">{c.phone || '—'}</p>
                      {c.email ? <p className="text-xs text-slate-500">{c.email}</p> : null}
                    </TD>
                    <TD className="tabular-nums">
                      {c.creditLimitKobo > 0 ? formatKobo(c.creditLimitKobo) : '—'}
                    </TD>
                    <TD className="tabular-nums">
                      <span
                        className={
                          c.balanceKobo > 0
                            ? 'font-semibold text-amber-600 dark:text-amber-400'
                            : ''
                        }
                      >
                        {formatKobo(c.balanceKobo)}
                      </span>
                    </TD>
                    <TD>
                      <Badge
                        className={
                          c.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {c.isActive ? 'Active' : 'Archived'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setProfile(c)}>
                          Profile
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setHistory(c)}>
                          History
                        </Button>
                        <RequirePermission permission="customers.manage">
                          <Button variant="ghost" size="sm" onClick={() => setPaying(c)}>
                            <Banknote className="h-4 w-4" /> Payment
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${c.name}`}
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={c.isActive ? `Archive ${c.name}` : `Restore ${c.name}`}
                            disabled={archiveMutation.isPending}
                            onClick={() => archiveMutation.mutate(c)}
                          >
                            {c.isActive ? (
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
        title={editing ? `Edit ${editing.name}` : 'New customer'}
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
            placeholder="e.g. Ada Obi"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            autoFocus
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Phone (optional)"
              placeholder="0803 000 0000"
              value={values.phone}
              onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            />
            <Input
              label="Email (optional)"
              type="email"
              placeholder="ada@example.com"
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
            label="Credit limit (0 = no credit)"
            placeholder="0.00"
            value={values.creditLimit}
            onChange={(e) => setValues((v) => ({ ...v, creditLimit: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
          {tiersEnabled && (tiersQuery.data?.length ?? 0) > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Price list
              </label>
              <select
                value={values.priceTierId}
                onChange={(e) => setValues((v) => ({ ...v, priceTierId: e.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Normal retail price</option>
                {(tiersQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
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
              {saveMutation.isPending ? 'Saving…' : 'Save customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {paying ? (
        <PaymentModal
          customer={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            void invalidate();
          }}
        />
      ) : null}

      {history ? <HistoryModal customer={history} onClose={() => setHistory(null)} /> : null}

      {profile ? (
        <ProfileModal
          customer={profile}
          onClose={() => {
            setProfile(null);
            void invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function PaymentModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [amount, setAmount] = useState((customer.balanceKobo / 100).toFixed(2));
  const [method, setMethod] = useState<'cash' | 'transfer' | 'pos'>('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const amountKobo = parseNairaToKobo(amount);
      if (amountKobo === null || amountKobo <= 0) throw new Error('Enter an amount like 2500.00');
      const res = await ipc.customersPayment({
        customerId: customer.id,
        amountKobo,
        method,
        reference: reference.trim(),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not record the payment');
    },
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal open title={`Record payment — ${customer.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Owing now: <span className="font-semibold">{formatKobo(customer.balanceKobo)}</span>
        </p>
        <Input
          label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <div>
          <label
            htmlFor="payment-method"
            className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
          >
            Method
          </label>
          <select
            id="payment-method"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={method}
            onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer' | 'pos')}
          >
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
            <option value="pos">POS</option>
          </select>
        </div>
        <Input
          label="Reference (optional)"
          placeholder="e.g. transfer ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoryModal({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}): JSX.Element {
  const paymentsQuery = useQuery({
    queryKey: ['customer-payments', customer.id],
    queryFn: async () => {
      const res = await ipc.customersPayments(customer.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not load payments');
      return (res.items ?? []) as CustomerPaymentRow[];
    },
  });

  return (
    <Modal open title={`Payments — ${customer.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Owing now: <span className="font-semibold">{formatKobo(customer.balanceKobo)}</span>
        </p>
        {paymentsQuery.isLoading ? <LoadingState label="Loading payments…" /> : null}
        {paymentsQuery.isError ? (
          <ErrorState message={(paymentsQuery.error as Error).message} />
        ) : null}
        {paymentsQuery.isSuccess && (paymentsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : null}
        {paymentsQuery.isSuccess && (paymentsQuery.data ?? []).length > 0 ? (
          <Table>
            <THead>
              <TRow>
                <TH>Date</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>By</TH>
              </TRow>
            </THead>
            <tbody>
              {(paymentsQuery.data ?? []).map((p) => (
                <TRow key={p.id}>
                  <TD>{new Date(p.createdAt).toLocaleString()}</TD>
                  <TD className="tabular-nums">{formatKobo(p.amountKobo)}</TD>
                  <TD className="capitalize">{p.method}</TD>
                  <TD>{p.userName ?? '—'}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        ) : null}
      </div>
    </Modal>
  );
}

function ProfileModal({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const businessType = useSession((s) => s.user?.businessType);
  const modules = useSession((s) => s.user?.modules);
  const loyaltyEnabled = hasModule(businessType, 'loyalty', modules);
  const [noteBody, setNoteBody] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['customer-summary', customer.id],
    queryFn: async () => {
      const res = await ipc.customerVisitSummary(customer.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not load visits');
      return res.summary ?? { visits: 0, spentKobo: 0, lastVisitAt: null };
    },
  });

  const notesQuery = useQuery({
    queryKey: ['customer-notes', customer.id],
    queryFn: async () => {
      const res = await ipc.customerNotes(customer.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not load notes');
      return (res.items ?? []) as CustomerNoteRow[];
    },
  });

  const loyaltyQuery = useQuery({
    queryKey: ['loyalty-entries', customer.id],
    enabled: loyaltyEnabled,
    queryFn: async () => {
      const res = await ipc.loyaltyEntries(customer.id);
      if (!res.ok) throw new Error(res.error ?? 'Could not load loyalty points');
      return { items: (res.items ?? []) as LoyaltyEntryRow[], balance: res.balance ?? 0 };
    },
  });

  const noteMutation = useMutation({
    mutationFn: async () => {
      if (noteBody.trim() === '') throw new Error('Write a note first');
      const res = await ipc.customerNoteAdd(customer.id, { body: noteBody.trim() });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the note');
    },
    onSuccess: async () => {
      setNoteBody('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['customer-notes', customer.id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const value = Number(points);
      if (!Number.isInteger(value) || value === 0) throw new Error('Enter points (use minus to deduct)');
      if (reason.trim().length < 3) throw new Error('Give a reason of at least 3 characters');
      const res = await ipc.loyaltyAdjust({ customerId: customer.id, points: value, reason: reason.trim() });
      if (!res.ok) throw new Error(res.error ?? 'Could not adjust points');
    },
    onSuccess: async () => {
      setPoints('');
      setReason('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['loyalty-entries', customer.id] });
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const summary = summaryQuery.data;

  return (
    <Modal open title={`Profile — ${customer.name}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <p className="text-lg font-bold tabular-nums">{summary?.visits ?? 0}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Visits</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <p className="text-lg font-bold tabular-nums">{formatKobo(summary?.spentKobo ?? 0)}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Spent</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <p className="text-sm font-semibold">{customer.priceTierName ?? 'Retail'}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Price list</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Last visit: {summary?.lastVisitAt ? new Date(summary.lastVisitAt).toLocaleString() : '—'} · Owing:{' '}
          {formatKobo(customer.balanceKobo)}
        </p>

        {loyaltyEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Loyalty points
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {loyaltyQuery.data?.balance ?? 0} points
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loyaltyQuery.isPending ? <LoadingState label="Loading points…" /> : null}
              {(loyaltyQuery.data?.items.length ?? 0) > 0 ? (
                <div className="max-h-40 overflow-y-auto">
                  <Table>
                    <THead>
                      <TRow>
                        <TH>When</TH>
                        <TH>Points</TH>
                        <TH>Reason</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {loyaltyQuery.data?.items.map((e) => (
                        <TRow key={e.id}>
                          <TD className="text-xs">{new Date(e.createdAt).toLocaleDateString()}</TD>
                          <TD
                            className={
                              e.points >= 0 ? 'tabular-nums text-emerald-600' : 'tabular-nums text-red-600'
                            }
                          >
                            {e.points > 0 ? `+${e.points}` : e.points}
                          </TD>
                          <TD className="text-xs">{e.reason}</TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No points activity yet.</p>
              )}
              <RequirePermission permission="customers.manage">
                <div className="flex items-end gap-2">
                  <Input
                    label="Adjust"
                    placeholder="+50 or -20"
                    value={points}
                    onChange={(e) => setPoints(e.target.value.replace(/[^0-9-]/g, ''))}
                    className="w-24"
                  />
                  <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Button size="sm" onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending}>
                    Apply
                  </Button>
                </div>
              </RequirePermission>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(notesQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {(notesQuery.data ?? []).map((n) => (
                  <li key={n.id} className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/50">
                    {n.body}
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                      {n.userName ? ` · ${n.userName}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <Input
                label="New note"
                placeholder="e.g. Prefers delivery on Fridays"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button size="sm" onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
