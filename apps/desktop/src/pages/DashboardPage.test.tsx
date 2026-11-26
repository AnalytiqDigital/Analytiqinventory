import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../stores/session';
import type { ReportsSummary } from '../types/global';
import { DashboardPage } from './DashboardPage';

afterEach(cleanup);

const { reportsSummary, expiryAlerts } = vi.hoisted(() => ({
  reportsSummary: vi.fn(),
  expiryAlerts: vi.fn(),
}));

vi.mock('../lib/ipc', () => ({ ipc: { reportsSummary, expiryAlerts } }));

const summary: ReportsSummary = {
  range: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-23T12:00:00.000Z', locationId: null },
  sales: {
    transactions: 2,
    subtotalKobo: 100_000,
    discountKobo: 5_000,
    taxKobo: 7_500,
    grossKobo: 97_500,
    netKobo: 90_000,
    refundCount: 0,
    refundsKobo: 0,
    voidCount: 0,
    cogsKobo: 60_000,
    grossProfitKobo: 30_000,
    averageBasketKobo: 48_750,
  },
  payments: [{ method: 'cash', count: 2, amountKobo: 97_500 }],
  daily: [{ date: '2026-11-23', transactions: 2, grossKobo: 97_500, taxKobo: 7_500 }],
  weekly: [],
  topProducts: [
    {
      productId: 'p1',
      name: 'Rice, 5kg',
      qty: 10,
      revenueKobo: 60_000,
      profitKobo: 20_000,
    },
  ],
  products: [],
  stockAlerts: [],
  topCustomers: [],
  cashiers: [{ customerId: null, name: 'Ada', transactions: 2, totalKobo: 97_500 }],
  inventory: {
    productCount: 3,
    lowStockCount: 1,
    costValueKobo: 182_000,
    retailValueKobo: 275_000,
  },
  purchases: { receivedCount: 0, receivedKobo: 0 },
  credit: { outstandingKobo: 47_500, activeCustomers: 1 },
  expenses: { totalKobo: 10_000, count: 1, byCategory: [] },
  finance: { expensesKobo: 10_000, netProfitKobo: 20_000 },
};

// Re-rendering the page from above exercises the old bug: a fresh `now`
// in AnalyticsDashboard changed both query keys on every render.
function Harness(): JSX.Element {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  return (
    <>
      <button type="button" onClick={rerender}>
        Force render
      </button>
      <DashboardPage />
    </>
  );
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('DashboardPage analytics', () => {
  beforeEach(() => {
    reportsSummary.mockReset();
    reportsSummary.mockResolvedValue({ ok: true, summary });
    expiryAlerts.mockReset();
    expiryAlerts.mockResolvedValue({ ok: true, items: [] });
    useSession.setState({
      user: {
        id: 'user-1',
        businessId: 'business-1',
        name: 'Owner',
        email: 'owner@example.com',
        permissions: ['reports.view', 'inventory.view'],
        businessType: 'retail',
        modules: ['products', 'inventory', 'reports'],
      },
      checked: true,
    });
  });

  it('renders analytics and keeps the reporting window stable across renders', async () => {
    renderPage();

    expect(await screen.findByText('Gross profit (month)')).toBeInTheDocument();
    expect(screen.getByText("Today's sales")).toBeInTheDocument();
    await waitFor(() => expect(reportsSummary).toHaveBeenCalledTimes(2));
    const initialArgs = reportsSummary.mock.calls.map((call) => call[0]);

    await userEvent.click(screen.getByRole('button', { name: 'Force render' }));

    await waitFor(() => expect(reportsSummary).toHaveBeenCalledTimes(2));
    expect(reportsSummary.mock.calls.map((call) => call[0])).toEqual(initialArgs);
  });

  it('lists expiring batches and links to the filtered batches page', async () => {
    expiryAlerts.mockResolvedValue({
      ok: true,
      items: [
        {
          id: 'bat-1',
          productId: 'p1',
          productName: 'Yoghurt 500ml',
          sku: 'YOG-500',
          unit: 'pcs',
          batchNo: 'B-12',
          expiryDate: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          manufacturedDate: null,
          locationId: 'loc-1',
          locationName: 'Main shop',
          remaining: 6,
          onHand: 6,
          nearExpiryDays: 30,
          status: 'expiring',
        },
        {
          id: 'bat-2',
          productId: 'p2',
          productName: 'Painkiller 20s',
          sku: null,
          unit: 'pack',
          batchNo: 'B-03',
          expiryDate: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          manufacturedDate: null,
          locationId: 'loc-1',
          locationName: 'Main shop',
          remaining: 3,
          onHand: 3,
          nearExpiryDays: 30,
          status: 'expired',
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('Expiring soon')).toBeInTheDocument();
    expect(await screen.findByText('Yoghurt 500ml')).toBeInTheDocument();
    expect(screen.getByText('4d left')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /View all/ });
    expect(links.some((link) => link.getAttribute('href') === '/batches?expiry=30')).toBe(true);
  });

  it('shows a retryable error instead of an endless loader', async () => {
    reportsSummary.mockRejectedValue(new Error('Analytics unavailable'));
    renderPage();

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Analytics unavailable'
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
