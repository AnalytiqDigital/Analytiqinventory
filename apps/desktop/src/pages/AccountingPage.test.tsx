import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportsSummary } from '../types/global';
import { AccountingPage } from './AccountingPage';

afterEach(cleanup);

const { reportsSummary } = vi.hoisted(() => ({ reportsSummary: vi.fn() }));

vi.mock('../lib/ipc', () => ({ ipc: { reportsSummary } }));

const summary: ReportsSummary = {
  range: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-20T12:00:00.000Z', locationId: null },
  sales: {
    transactions: 2,
    subtotalKobo: 100_000,
    discountKobo: 5_000,
    taxKobo: 7_500,
    grossKobo: 97_500,
    netKobo: 90_000,
    refundCount: 1,
    refundsKobo: 3_000,
    voidCount: 1,
    cogsKobo: 60_000,
    grossProfitKobo: 30_000,
    averageBasketKobo: 45_000,
  },
  payments: [{ method: 'cash', count: 2, amountKobo: 97_500 }],
  daily: [{ date: '2026-11-20', transactions: 2, grossKobo: 97_500, taxKobo: 7_500 }],
  weekly: [],
  topProducts: [],
  products: [
    {
      productId: 'p1',
      name: 'Rice, 5kg',
      sku: 'RICE-5',
      qty: 10,
      revenueKobo: 60_000,
      profitKobo: 20_000,
      onHand: 4,
      reorderLevel: 10,
      costValueKobo: 160_000,
      retailValueKobo: 240_000,
    },
    {
      productId: 'p2',
      name: 'Milk',
      sku: 'MILK-1',
      qty: 5,
      revenueKobo: 20_000,
      profitKobo: 5_000,
      onHand: 3,
      reorderLevel: 6,
      costValueKobo: 12_000,
      retailValueKobo: 20_000,
    },
    {
      productId: 'p3',
      name: 'Broom',
      sku: 'BROOM-1',
      qty: 0,
      revenueKobo: 0,
      profitKobo: 0,
      onHand: 20,
      reorderLevel: 5,
      costValueKobo: 10_000,
      retailValueKobo: 15_000,
    },
  ],
  stockAlerts: [],
  topCustomers: [],
  cashiers: [{ customerId: null, name: 'Ada', transactions: 2, totalKobo: 97_500 }],
  inventory: {
    productCount: 3,
    lowStockCount: 2,
    costValueKobo: 182_000,
    retailValueKobo: 275_000,
  },
  purchases: { receivedCount: 0, receivedKobo: 0 },
  credit: { outstandingKobo: 47_500, activeCustomers: 1 },
  expenses: {
    totalKobo: 10_000,
    count: 2,
    byCategory: [
      { category: 'Rent', count: 1, amountKobo: 7_000 },
      { category: 'Utilities', count: 1, amountKobo: 3_000 },
    ],
  },
  finance: { expensesKobo: 10_000, netProfitKobo: 20_000 },
};

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AccountingPage />
    </QueryClientProvider>
  );
}

describe('AccountingPage', () => {
  beforeEach(() => {
    reportsSummary.mockReset();
    reportsSummary.mockResolvedValue({ ok: true, summary });
  });

  it('shows the statement summary on the overview tab', async () => {
    renderPage();
    expect(await screen.findByText('Statement summary')).toBeInTheDocument();
    expect(screen.getByText('Expenses by category')).toBeInTheDocument();
    expect(screen.getAllByText('₦300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Rent')).toBeInTheDocument();
  });

  it('renders the profit and loss statement with derived margins', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Statement summary');
    await user.click(screen.getByRole('button', { name: 'Profit & loss' }));
    expect(await screen.findByText('Profit and loss statement')).toBeInTheDocument();
    expect(screen.getByText('Sales before discounts')).toBeInTheDocument();
    expect(screen.getByText('Less: loyalty points redeemed')).toBeInTheDocument();
    const table = screen.getByText('Sales before discounts').closest('table');
    expect(table).not.toBeNull();
    expect(within(table as HTMLTableElement).getByText('₦1,000.00')).toBeInTheDocument();
    expect(within(table as HTMLTableElement).getByText('33.3%')).toBeInTheDocument();
    expect(
      within(table as HTMLTableElement).getByText('Net profit (22.2% of net sales)')
    ).toBeInTheDocument();
  });

  it('renders the product sales statement with totals and unsold count', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Statement summary');
    await user.click(screen.getByRole('button', { name: 'Product sales' }));
    expect(await screen.findByText('Product sales statement')).toBeInTheDocument();
    expect(screen.getByText('Rice, 5kg')).toBeInTheDocument();
    expect(screen.queryByText('Broom')).not.toBeInTheDocument();
    expect(screen.getByText(/1 active product had no sales in this period/)).toBeInTheDocument();
    const totalRow = screen.getByText('Total').closest('tr');
    expect(totalRow).not.toBeNull();
    expect(within(totalRow as HTMLTableRowElement).getByText('₦800.00')).toBeInTheDocument();
  });
});
