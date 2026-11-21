import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsPage } from './AccountsPage';

afterEach(cleanup);

const {
  accounts,
  accountTransactions,
  accountPaymentMap,
  accountPaymentMapSet,
  accountCreate,
  accountUpdate,
  accountTransfer,
  accountAdjust,
} = vi.hoisted(() => ({
  accounts: vi.fn(),
  accountTransactions: vi.fn(),
  accountPaymentMap: vi.fn(),
  accountPaymentMapSet: vi.fn(),
  accountCreate: vi.fn(),
  accountUpdate: vi.fn(),
  accountTransfer: vi.fn(),
  accountAdjust: vi.fn(),
}));

vi.mock('../lib/ipc', () => ({
  ipc: {
    accounts,
    accountTransactions,
    accountPaymentMap,
    accountPaymentMapSet,
    accountCreate,
    accountUpdate,
    accountTransfer,
    accountAdjust,
  },
}));

const ACCOUNTS = [
  {
    id: 'acc-cash',
    name: 'Cash drawer',
    kind: 'cash',
    openingBalanceKobo: 0,
    balanceKobo: 50_000,
    isDefault: true,
    archived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'acc-bank',
    name: 'Main bank',
    kind: 'bank',
    openingBalanceKobo: 100_000,
    balanceKobo: 150_000,
    isDefault: false,
    archived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccountsPage />
    </QueryClientProvider>
  );
}

describe('AccountsPage', () => {
  beforeEach(() => {
    for (const fn of [
      accounts,
      accountTransactions,
      accountPaymentMap,
      accountPaymentMapSet,
      accountCreate,
      accountUpdate,
      accountTransfer,
      accountAdjust,
    ]) {
      fn.mockReset();
    }
    accounts.mockResolvedValue({ ok: true, items: ACCOUNTS, totalKobo: 200_000 });
    accountTransactions.mockResolvedValue({
      ok: true,
      items: [
        {
          id: 'tx-1',
          accountId: 'acc-cash',
          accountName: 'Cash drawer',
          kind: 'sale',
          amountKobo: 50_000,
          reference: 'INV-1',
          note: 'Counter sale',
          source: 'sale',
          sourceId: 'sale-1',
          createdAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      moneyInKobo: 50_000,
      moneyOutKobo: 0,
    });
    accountPaymentMap.mockResolvedValue({ ok: true, map: {} });
    accountPaymentMapSet.mockResolvedValue({ ok: true, map: {} });
    accountCreate.mockResolvedValue({ ok: true });
    accountUpdate.mockResolvedValue({ ok: true });
    accountTransfer.mockResolvedValue({ ok: true });
    accountAdjust.mockResolvedValue({ ok: true, balanceKobo: 60_000 });
  });

  it('shows account balances and the ledger', async () => {
    renderPage();
    expect((await screen.findAllByText('Cash drawer')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Main bank').length).toBeGreaterThan(0);
    expect(screen.getByText('₦2,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('₦500.00').length).toBeGreaterThan(0);
    expect(await screen.findByText('Counter sale')).toBeInTheDocument();
    expect(screen.getByText('+₦500.00')).toBeInTheDocument();
  });

  it('creates a bank account', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Counter sale');

    await user.click(screen.getByRole('button', { name: 'Add account' }));
    await user.type(screen.getByLabelText('Account name'), 'POS terminal');
    await user.selectOptions(screen.getByLabelText('Account type'), 'pos');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(accountCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'POS terminal', kind: 'pos', openingBalanceKobo: 0 })
      )
    );
  });

  it('moves money between accounts', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Counter sale');

    await user.click(screen.getByRole('button', { name: /Move money/ }));
    await user.selectOptions(screen.getByLabelText('To account'), 'acc-bank');
    await user.type(screen.getByLabelText('Amount (₦)'), '3000');
    await user.click(screen.getByRole('button', { name: 'Transfer' }));

    await waitFor(() =>
      expect(accountTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'acc-cash',
          toAccountId: 'acc-bank',
          amountKobo: 300_000,
        })
      )
    );
  });
});
