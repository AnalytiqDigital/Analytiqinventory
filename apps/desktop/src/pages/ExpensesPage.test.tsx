import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseRow } from '../types/global';
import { ExpensesPage } from './ExpensesPage';

afterEach(cleanup);

const { expenses, expenseCreate, expenseUpdate, expenseDelete, accounts } = vi.hoisted(() => ({
  expenses: vi.fn(),
  expenseCreate: vi.fn(),
  expenseUpdate: vi.fn(),
  expenseDelete: vi.fn(),
  accounts: vi.fn(),
}));

vi.mock('../lib/ipc', () => ({
  ipc: { expenses, expenseCreate, expenseUpdate, expenseDelete, accounts },
}));

const items: ExpenseRow[] = [
  {
    id: 'e1',
    category: 'Rent',
    note: 'November rent',
    amountKobo: 500_000,
    paidAt: '2026-11-02T12:00:00.000Z',
    locationId: 'loc-1',
    accountId: 'acc-1',
    accountName: 'Main bank',
    createdBy: 'u1',
    createdByName: 'Ada Admin',
    createdAt: '2026-11-02T12:00:00.000Z',
  },
  {
    id: 'e2',
    category: 'Transport',
    note: 'Bus fare',
    amountKobo: 20_000,
    paidAt: '2026-11-05T12:00:00.000Z',
    locationId: 'loc-1',
    accountId: null,
    accountName: '',
    createdBy: 'u1',
    createdByName: 'Ada Admin',
    createdAt: '2026-11-05T12:00:00.000Z',
  },
];

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ExpensesPage />
    </QueryClientProvider>
  );
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    expenses.mockReset();
    expenseCreate.mockReset();
    expenseUpdate.mockReset();
    expenseDelete.mockReset();
    accounts.mockReset();
    expenses.mockResolvedValue({ ok: true, items, totalKobo: 520_000 });
    accounts.mockResolvedValue({
      ok: true,
      items: [
        {
          id: 'acc-1',
          name: 'Main bank',
          kind: 'bank',
          openingBalanceKobo: 0,
          balanceKobo: 100_000,
          isDefault: true,
          archived: false,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
      totalKobo: 100_000,
    });
    expenseCreate.mockResolvedValue({ ok: true });
    expenseUpdate.mockResolvedValue({ ok: true });
    expenseDelete.mockResolvedValue({ ok: true });
  });

  it('lists expenses with totals and filters by category', async () => {
    renderPage();

    expect(await screen.findByText('November rent')).toBeInTheDocument();
    expect(screen.getByText('Bus fare')).toBeInTheDocument();
    expect(screen.getByText('Total spent')).toBeInTheDocument();
    expect(screen.getAllByText('₦5,200.00').length).toBeGreaterThan(0);
    expect(screen.getByText('₦2,600.00')).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'Transport');
    expect(screen.queryByText('November rent')).not.toBeInTheDocument();
    expect(screen.getByText('Bus fare')).toBeInTheDocument();
    expect(screen.getAllByText('₦200.00').length).toBeGreaterThan(0);
  });

  it('searches notes within the selected period', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('November rent');

    await user.type(screen.getByLabelText('Search'), 'bus');
    expect(screen.queryByText('November rent')).not.toBeInTheDocument();
    expect(screen.getByText('Bus fare')).toBeInTheDocument();
  });

  it('edits an existing expense', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('November rent');

    await user.click(screen.getByRole('button', { name: /^Edit Rent expense/ }));
    expect(await screen.findByText('Edit expense')).toBeInTheDocument();

    const amount = screen.getByLabelText('Amount (₦)');
    await user.clear(amount);
    await user.type(amount, '7500');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(expenseUpdate).toHaveBeenCalledWith(
        'e1',
        expect.objectContaining({ category: 'Rent', amountKobo: 750_000, note: 'November rent' })
      )
    );
  });

  it('records a new expense', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('November rent');

    await user.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(await screen.findByText('Record an expense')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Amount (₦)'), '1200.50');
    await user.click(screen.getByRole('button', { name: 'Save expense' }));

    await waitFor(() =>
      expect(expenseCreate).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Rent', amountKobo: 120_050 })
      )
    );
  });

  it('deletes an expense after confirmation', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Bus fare');

    await user.click(screen.getByRole('button', { name: /^Delete Transport expense/ }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(expenseDelete).toHaveBeenCalledWith('e2'));
  });
});
