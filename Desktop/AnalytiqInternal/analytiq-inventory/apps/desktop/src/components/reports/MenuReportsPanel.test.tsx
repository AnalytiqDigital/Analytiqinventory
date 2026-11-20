import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MenuReports } from '../../types/global';
import { MenuReportsPanel } from './MenuReportsPanel';

afterEach(cleanup);

const report: MenuReports = {
  range: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-20T12:00:00.000Z', locationId: null },
  purchaseSale: {
    daily: [
      {
        date: '2026-11-02',
        salesCount: 2,
        salesKobo: 96_750,
        purchaseCount: 1,
        purchaseKobo: 160_000,
      },
    ],
    salesCount: 2,
    salesKobo: 96_750,
    purchaseCount: 1,
    purchaseKobo: 160_000,
  },
  tax: {
    outputKobo: 6_750,
    inputKobo: 0,
    netKobo: 6_750,
    daily: [{ date: '2026-11-02', outputKobo: 6_750, inputKobo: 0 }],
  },
  customers: [
    {
      customerId: 'cus_1',
      name: 'Ada Obi',
      phone: '08030000000',
      groupName: 'Wholesale',
      transactions: 3,
      spendKobo: 120_000,
      balanceKobo: 40_000,
    },
  ],
  suppliers: [
    {
      supplierId: 'sup_1',
      name: 'Peak Foods',
      purchasesKobo: 160_000,
      paidKobo: 0,
      returnsKobo: 32_000,
      balanceKobo: 128_000,
    },
  ],
  receivablesKobo: 40_000,
  payablesKobo: 128_000,
  customerGroups: [
    { groupId: 'grp_1', name: 'Wholesale', customers: 1, salesKobo: 120_000, creditKobo: 40_000 },
  ],
  stockAdjustments: [
    {
      id: 'adj_1',
      reference: 'ADJ-000001',
      date: '2026-11-03',
      locationName: 'Main Store',
      reason: 'Damaged',
      lines: 1,
      qtyNet: -2,
    },
  ],
  productPurchases: [
    { productId: 'prd_1', name: 'Indomie 70g', sku: 'IND-70', qty: 5, costKobo: 160_000 },
  ],
  purchasePayments: [
    {
      id: 'pur_1',
      reference: 'PUR-000001',
      supplierName: 'Peak Foods',
      receivedAt: '2026-11-02T10:00:00.000Z',
      totalKobo: 160_000,
      paidKobo: 0,
      returnsKobo: 32_000,
      balanceKobo: 128_000,
    },
  ],
  sellPayments: [{ method: 'cash', count: 2, amountKobo: 96_750 }],
  registers: [
    {
      locationId: 'loc_1',
      locationName: 'Main Store',
      transactions: 2,
      grossKobo: 96_750,
      taxKobo: 6_750,
      cashKobo: 96_750,
      transferKobo: 0,
      posKobo: 0,
      creditKobo: 0,
    },
  ],
  salesReps: [
    {
      userId: 'usr_1',
      name: 'Ada Admin',
      transactions: 2,
      grossKobo: 96_750,
      discountKobo: 0,
      taxKobo: 6_750,
      refundsKobo: 0,
    },
  ],
};

describe('MenuReportsPanel', () => {
  it('shows sales against purchases day by day', () => {
    render(<MenuReportsPanel tab="purchase-sale" report={report} />);
    expect(screen.getByText('Day by day')).toBeInTheDocument();
    expect(screen.getAllByText('₦967.50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₦1,600.00').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-11-02')).toBeInTheDocument();
  });

  it('summarises the tax position', () => {
    render(<MenuReportsPanel tab="tax" report={report} />);
    expect(screen.getByText('Output tax (sales)')).toBeInTheDocument();
    expect(screen.getAllByText('₦67.50').length).toBeGreaterThan(0);
    expect(screen.getByText('payable')).toBeInTheDocument();
  });

  it('lists receivables and payables for suppliers and customers', () => {
    render(<MenuReportsPanel tab="suppliers-customers" report={report} />);
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Peak Foods')).toBeInTheDocument();
    expect(screen.getByText('Wholesale')).toBeInTheDocument();
  });

  it('signs stock adjustment quantities', () => {
    render(<MenuReportsPanel tab="adjustments" report={report} />);
    expect(screen.getByText('ADJ-000001')).toBeInTheDocument();
    expect(screen.getByText('Damaged')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
  });

  it('shows the outstanding balance on purchase payments', () => {
    render(<MenuReportsPanel tab="purchase-payments" report={report} />);
    expect(screen.getByText('PUR-000001')).toBeInTheDocument();
    expect(screen.getByText('₦1,280.00')).toBeInTheDocument();
  });

  it('shows payment shares and register totals', () => {
    render(<MenuReportsPanel tab="sell-payments" report={report} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    cleanup();
    render(<MenuReportsPanel tab="registers" report={report} />);
    expect(screen.getByText('Sales by register (branch)')).toBeInTheDocument();
    expect(screen.getByText('Main Store')).toBeInTheDocument();
  });

  it('renders an empty state for quiet tabs', () => {
    const empty: MenuReports = {
      ...report,
      customerGroups: [],
      productPurchases: [],
      registers: [],
      salesReps: [],
    };
    render(<MenuReportsPanel tab="customer-groups" report={empty} />);
    expect(
      screen.getByText('No customer groups yet. Add groups under Units, Brands & Groups.')
    ).toBeInTheDocument();
    cleanup();
    render(<MenuReportsPanel tab="sales-reps" report={empty} />);
    expect(screen.getByText('No sales in this period.')).toBeInTheDocument();
  });
});
