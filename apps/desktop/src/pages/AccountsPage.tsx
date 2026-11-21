import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Banknote,
  Landmark,
  Pencil,
  Plus,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, type AccountKind } from '@analytiq/validation';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Modal } from '../components/ui/modal';
import { Stat } from '../components/ui/stat';
import { ConfirmDialog, ErrorState, LoadingState } from '../components/ui/states';
import { TD, TH, THead, TRow, Table } from '../components/ui/table';
import { ipc } from '../lib/ipc';
import { formatKobo, parseNairaToKobo } from '../lib/money';
import type { AccountRow, AccountTransactionRow } from '../types/global';

const KIND_ICONS: Record<AccountKind, typeof Wallet> = {
  cash: Banknote,
  bank: Landmark,
  pos: Smartphone,
  mobile: Smartphone,
};

const LEDGER_LABELS: Record<string, string> = {
  sale: 'Sale',
  refund: 'Refund',
  sale_void: 'Sale void',
  expense: 'Expense',
  expense_reversal: 'Expense correction',
  customer_payment: 'Customer payment',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  adjustment: 'Adjustment',
};

type MapMethod = 'cash' | 'transfer' | 'pos';
const MAP_METHODS: Array<{ key: MapMethod; label: string }> = [
  { key: 'cash', label: 'Cash' },
  { key: 'transfer', label: 'Bank transfer' },
  { key: 'pos', label: 'POS terminal' },
];

interface AccountForm {
  name: string;
  kind: AccountKind;
  opening: string;
  isDefault: boolean;
}

function emptyAccountForm(): AccountForm {
  return { name: '', kind: 'cash', opening: '0.00', isDefault: false };
}

export function AccountsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [values, setValues] = useState<AccountForm>(emptyAccountForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transfer, setTransfer] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    note: '',
  });

  const [adjusting, setAdjusting] = useState<AccountRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ amount: '', note: '' });
  const [archiving, setArchiving] = useState<AccountRow | null>(null);

  const [ledgerAccountId, setLedgerAccountId] = useState('');

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await ipc.accounts({ includeArchived: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not load accounts');
      return res;
    },
  });

  const ledgerQuery = useQuery({
    queryKey: ['account-transactions', ledgerAccountId],
    queryFn: async () => {
      const res = await ipc.accountTransactions({
        accountId: ledgerAccountId || null,
        limit: 100,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not load the ledger');
      return res;
    },
  });

  const paymentMapQuery = useQuery({
    queryKey: ['account-payment-map'],
    queryFn: async () => {
      const res = await ipc.accountPaymentMap();
      if (!res.ok) throw new Error(res.error ?? 'Could not load the payment map');
      return res.map;
    },
  });

  const accounts = accountsQuery.data?.items ?? [];
  const activeAccounts = accounts.filter((a) => !a.archived);

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    ]);
  };

  function openCreate(): void {
    setEditing(null);
    setValues(emptyAccountForm());
    setFormError(null);
    setAccountModalOpen(true);
  }

  function openEdit(account: AccountRow): void {
    setEditing(account);
    setValues({
      name: account.name,
      kind: account.kind,
      opening: (account.openingBalanceKobo / 100).toFixed(2),
      isDefault: account.isDefault,
    });
    setFormError(null);
    setAccountModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const openingBalanceKobo = parseNairaToKobo(values.opening.trim() || '0');
      if (openingBalanceKobo === null || openingBalanceKobo < 0) {
        throw new Error('Enter the opening balance like 0.00');
      }
      const payload = {
        name: values.name.trim(),
        kind: values.kind,
        openingBalanceKobo,
        isDefault: values.isDefault,
      };
      if (!payload.name) throw new Error('Give the account a name');
      const res = editing
        ? await ipc.accountUpdate(editing.id, payload)
        : await ipc.accountCreate(payload);
      if (!res.ok) throw new Error(res.error ?? 'Could not save the account');
    },
    onSuccess: async () => {
      setAccountModalOpen(false);
      setEditing(null);
      setValues(emptyAccountForm());
      setFormError(null);
      await invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      const amountKobo = parseNairaToKobo(transfer.amount.trim());
      if (amountKobo === null || amountKobo <= 0) throw new Error('Enter an amount above zero');
      if (!transfer.fromAccountId || !transfer.toAccountId) throw new Error('Choose both accounts');
      if (transfer.fromAccountId === transfer.toAccountId) {
        throw new Error('Choose two different accounts');
      }
      const res = await ipc.accountTransfer({
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amountKobo,
        note: transfer.note.trim(),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not transfer the money');
    },
    onSuccess: async () => {
      setTransferOpen(false);
      setTransfer({ fromAccountId: '', toAccountId: '', amount: '', note: '' });
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjusting) throw new Error('No account selected');
      const raw = adjustForm.amount.trim();
      const negative = raw.startsWith('-');
      const magnitude = parseNairaToKobo(negative ? raw.slice(1) : raw);
      if (magnitude === null || magnitude === 0) {
        throw new Error('Enter a signed amount, e.g. -5000.00 to take money out');
      }
      const amountKobo = negative ? -magnitude : magnitude;
      if (adjustForm.note.trim().length < 3) throw new Error('Say what moved the money');
      const res = await ipc.accountAdjust({
        accountId: adjusting.id,
        amountKobo,
        note: adjustForm.note.trim(),
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not adjust the account');
    },
    onSuccess: async () => {
      setAdjusting(null);
      setAdjustForm({ amount: '', note: '' });
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: async (account: AccountRow) => {
      const res = await ipc.accountUpdate(account.id, { archived: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not archive the account');
    },
    onSuccess: async () => {
      setArchiving(null);
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => {
      setArchiving(null);
      setActionError(e.message);
    },
  });

  const makeDefaultMutation = useMutation({
    mutationFn: async (account: AccountRow) => {
      const res = await ipc.accountUpdate(account.id, { isDefault: true });
      if (!res.ok) throw new Error(res.error ?? 'Could not set the default account');
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const mapMutation = useMutation({
    mutationFn: async (next: Record<MapMethod, string>) => {
      const res = await ipc.accountPaymentMapSet({
        cash: next.cash || null,
        transfer: next.transfer || null,
        pos: next.pos || null,
      });
      if (!res.ok) throw new Error(res.error ?? 'Could not save the payment mapping');
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['account-payment-map'] });
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const [mapDraft, setMapDraft] = useState<Record<MapMethod, string> | null>(null);
  const mapValue = mapDraft ?? {
    cash: paymentMapQuery.data?.cash ?? '',
    transfer: paymentMapQuery.data?.transfer ?? '',
    pos: paymentMapQuery.data?.pos ?? '',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cash &amp; Bank</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every sale, refund, expense and customer payment posts to an account, so the drawer and
            bank balances match reality.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={activeAccounts.length < 2}
            onClick={() => {
              setTransfer({
                fromAccountId: activeAccounts[0]?.id ?? '',
                toAccountId: activeAccounts[1]?.id ?? '',
                amount: '',
                note: '',
              });
              setTransferOpen(true);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" /> Move money
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
        </div>
      </div>

      {actionError ? <ErrorState message={actionError} /> : null}
      {accountsQuery.isLoading ? <LoadingState label="Loading accounts…" /> : null}
      {accountsQuery.isError ? (
        <ErrorState
          message={(accountsQuery.error as Error).message}
          onRetry={() => void accountsQuery.refetch()}
        />
      ) : null}

      {accountsQuery.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Wallet}
              label="Total across accounts"
              value={formatKobo(accountsQuery.data.totalKobo)}
              sub={`${activeAccounts.length} active account${activeAccounts.length === 1 ? '' : 's'}`}
              tone="emerald"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const Icon = KIND_ICONS[account.kind] ?? Wallet;
              return (
                <Card key={account.id} className={account.archived ? 'opacity-60' : undefined}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="rounded-xl bg-brand-50 p-2 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{account.name}</p>
                          <p className="text-xs text-slate-500">
                            {ACCOUNT_KIND_LABELS[account.kind]}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {account.isDefault ? <Badge>Default</Badge> : null}
                        {account.archived ? <Badge>Archived</Badge> : null}
                      </div>
                    </div>
                    <p className="text-2xl font-black tabular-nums tracking-tight">
                      {formatKobo(account.balanceKobo)}
                    </p>
                    {!account.archived ? (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjusting(account);
                            setAdjustForm({ amount: '', note: '' });
                          }}
                        >
                          Adjust
                        </Button>
                        {!account.isDefault ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => makeDefaultMutation.mutate(account)}
                          >
                            Make default
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => openEdit(account)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setArchiving(account)}>
                          Archive
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Account ledger</CardTitle>
              <select
                aria-label="Filter ledger by account"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={ledgerAccountId}
                onChange={(e) => setLedgerAccountId(e.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </CardHeader>
            <CardContent>
              {ledgerQuery.isLoading ? <LoadingState label="Loading ledger…" /> : null}
              {ledgerQuery.isError ? (
                <ErrorState message={(ledgerQuery.error as Error).message} />
              ) : null}
              {ledgerQuery.data && ledgerQuery.data.items.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  No money has moved yet. Sales and expenses will appear here.
                </p>
              ) : null}
              {ledgerQuery.data && ledgerQuery.data.items.length > 0 ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-4 text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300">
                      In {formatKobo(ledgerQuery.data.moneyInKobo)}
                    </span>
                    <span className="text-red-600 dark:text-red-400">
                      Out {formatKobo(ledgerQuery.data.moneyOutKobo)}
                    </span>
                  </div>
                  <Table>
                    <THead>
                      <TRow>
                        <TH>When</TH>
                        <TH>Account</TH>
                        <TH>What</TH>
                        <TH>Note</TH>
                        <TH className="text-right">Amount</TH>
                      </TRow>
                    </THead>
                    <tbody>
                      {ledgerQuery.data.items.map((tx: AccountTransactionRow) => (
                        <TRow key={tx.id}>
                          <TD className="whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString()}
                          </TD>
                          <TD>{tx.accountName}</TD>
                          <TD>
                            <Badge>{LEDGER_LABELS[tx.kind] ?? tx.kind}</Badge>
                          </TD>
                          <TD className="max-w-[280px] truncate text-slate-500">
                            {tx.note || tx.reference || '—'}
                          </TD>
                          <TD
                            className={
                              tx.amountKobo >= 0
                                ? 'text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-300'
                                : 'text-right font-medium tabular-nums text-red-600 dark:text-red-400'
                            }
                          >
                            {tx.amountKobo >= 0 ? '+' : '−'}
                            {formatKobo(Math.abs(tx.amountKobo))}
                          </TD>
                        </TRow>
                      ))}
                    </tbody>
                  </Table>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Which account takes each payment type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                By default a cash sale posts to the cash drawer, a transfer to the bank account and
                a POS payment to the POS terminal. Choose a specific account to override that.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {MAP_METHODS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {label}
                    <select
                      aria-label={`Account for ${label}`}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal dark:border-slate-700 dark:bg-slate-900"
                      value={mapValue[key]}
                      onChange={(e) =>
                        setMapDraft({ ...mapValue, [key]: e.target.value })
                      }
                    >
                      <option value="">Automatic (by account type)</option>
                      {activeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={mapDraft === null || mapMutation.isPending}
                  onClick={() => mapDraft && mapMutation.mutate(mapDraft)}
                >
                  {mapMutation.isPending ? 'Saving…' : 'Save mapping'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Modal
        open={accountModalOpen}
        title={editing ? 'Edit account' : 'Add an account'}
        onClose={() => setAccountModalOpen(false)}
      >
        <div className="space-y-3">
          <Input
            label="Account name"
            name="account-name"
            placeholder="Main bank, Cash drawer, POS terminal"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Type
            </label>
            <select
              aria-label="Account type"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={values.kind}
              onChange={(e) => setValues((v) => ({ ...v, kind: e.target.value as AccountKind }))}
            >
              {ACCOUNT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ACCOUNT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Opening balance (₦)"
            name="account-opening"
            inputMode="decimal"
            value={values.opening}
            onChange={(e) => setValues((v) => ({ ...v, opening: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={values.isDefault}
              onChange={(e) => setValues((v) => ({ ...v, isDefault: e.target.checked }))}
            />
            Use as the default account
          </label>
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAccountModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={transferOpen} title="Move money between accounts" onClose={() => setTransferOpen(false)}>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            From
            <select
              aria-label="From account"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={transfer.fromAccountId}
              onChange={(e) => setTransfer((v) => ({ ...v, fromAccountId: e.target.value }))}
            >
              <option value="">Choose an account</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatKobo(account.balanceKobo)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            To
            <select
              aria-label="To account"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={transfer.toAccountId}
              onChange={(e) => setTransfer((v) => ({ ...v, toAccountId: e.target.value }))}
            >
              <option value="">Choose an account</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} — {formatKobo(account.balanceKobo)}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Amount (₦)"
            name="transfer-amount"
            inputMode="decimal"
            placeholder="5000.00"
            value={transfer.amount}
            onChange={(e) => setTransfer((v) => ({ ...v, amount: e.target.value }))}
          />
          <Input
            label="Note (optional)"
            name="transfer-note"
            value={transfer.note}
            onChange={(e) => setTransfer((v) => ({ ...v, note: e.target.value }))}
          />
          {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button disabled={transferMutation.isPending} onClick={() => transferMutation.mutate()}>
              {transferMutation.isPending ? 'Moving…' : 'Transfer'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={adjusting !== null}
        title={`Adjust ${adjusting?.name ?? 'account'}`}
        onClose={() => setAdjusting(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Use a positive amount to add money (float top-up) and a negative amount to take it out.
          </p>
          <Input
            label="Amount (₦, signed)"
            name="adjust-amount"
            inputMode="decimal"
            placeholder="-2000.00"
            value={adjustForm.amount}
            onChange={(e) => setAdjustForm((v) => ({ ...v, amount: e.target.value }))}
          />
          <Input
            label="What moved the money"
            name="adjust-note"
            placeholder="Petty cash top-up"
            value={adjustForm.note}
            onChange={(e) => setAdjustForm((v) => ({ ...v, note: e.target.value }))}
          />
          {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAdjusting(null)}>
              Cancel
            </Button>
            <Button disabled={adjustMutation.isPending} onClick={() => adjustMutation.mutate()}>
              {adjustMutation.isPending ? 'Adjusting…' : 'Save adjustment'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={archiving !== null}
        title="Archive account"
        message={`Archive ${archiving?.name ?? 'this account'}? Its balance must be zero first.`}
        confirmLabel="Archive"
        onConfirm={() => archiving && archiveMutation.mutate(archiving)}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
