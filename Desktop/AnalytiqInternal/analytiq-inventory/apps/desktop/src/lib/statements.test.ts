import { describe, expect, it } from 'vitest';
import type { ReportsSummary } from '../types/global';
import {
  buildProductSalesCsv,
  buildProductSalesStatement,
  buildProfitAndLoss,
  buildProfitAndLossCsv,
} from './statements';

function makeSummary(overrides: Partial<ReportsSummary> = {}): ReportsSummary {
  return {
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
    payments: [
      { method: 'cash', count: 1, amountKobo: 50_000 },
      { method: 'credit', count: 1, amountKobo: 47_500 },
    ],
    daily: [],
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
    cashiers: [],
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
    ...overrides,
  };
}

describe('buildProfitAndLoss', () => {
  it('derives loyalty discount as the remainder of revenue', () => {
    const statement = buildProfitAndLoss(makeSummary());
    expect(statement.income.salesBeforeDiscountsKobo).toBe(100_000);
    expect(statement.income.discountsKobo).toBe(5_000);
    expect(statement.income.loyaltyKobo).toBe(5_000);
    expect(statement.income.netSalesKobo).toBe(90_000);
    expect(statement.income.taxKobo).toBe(7_500);
    expect(statement.income.totalCollectedKobo).toBe(97_500);
  });

  it('closes from net sales to net profit and reports margins', () => {
    const statement = buildProfitAndLoss(makeSummary());
    expect(statement.cogsKobo).toBe(60_000);
    expect(statement.grossProfitKobo).toBe(30_000);
    expect(statement.grossMarginPct).toBe(33.3);
    expect(statement.expensesKobo).toBe(10_000);
    expect(statement.netProfitKobo).toBe(20_000);
    expect(statement.netMarginPct).toBe(22.2);
    expect(statement.expenses).toEqual([
      { category: 'Rent', amountKobo: 7_000 },
      { category: 'Utilities', amountKobo: 3_000 },
    ]);
  });

  it('handles a period with no sales without dividing by zero', () => {
    const statement = buildProfitAndLoss(
      makeSummary({
        sales: {
          transactions: 0,
          subtotalKobo: 0,
          discountKobo: 0,
          taxKobo: 0,
          grossKobo: 0,
          netKobo: 0,
          refundCount: 0,
          refundsKobo: 0,
          voidCount: 0,
          cogsKobo: 0,
          grossProfitKobo: 0,
          averageBasketKobo: 0,
        },
        expenses: { totalKobo: 0, count: 0, byCategory: [] },
      })
    );
    expect(statement.income.loyaltyKobo).toBe(0);
    expect(statement.grossMarginPct).toBe(0);
    expect(statement.netMarginPct).toBe(0);
    expect(statement.netProfitKobo).toBe(0);
  });

  it('exports a CSV with every line and escaped names', () => {
    const csv = buildProfitAndLossCsv(buildProfitAndLoss(makeSummary()));
    expect(csv).toContain('AnalytIQ profit and loss statement');
    expect(csv).toContain('Less: loyalty points redeemed,50.00');
    expect(csv).toContain('Net sales (tax excluded),900.00');
    expect(csv).toContain('Rent,70.00');
    expect(csv).toContain('Net margin %,22.2');
    expect(csv.split('\r\n').length).toBeGreaterThan(20);
  });
});

describe('buildProductSalesStatement', () => {
  it('lists only sold products and totals revenue, cost and profit', () => {
    const statement = buildProductSalesStatement(makeSummary());
    expect(statement.rows.map((row) => row.productId)).toEqual(['p1', 'p2']);
    expect(statement.rows[0]).toMatchObject({
      name: 'Rice, 5kg',
      qty: 10,
      revenueKobo: 60_000,
      cogsKobo: 40_000,
      profitKobo: 20_000,
      marginPct: 33.3,
      sharePct: 75,
    });
    expect(statement.rows[1]).toMatchObject({ cogsKobo: 15_000, marginPct: 25, sharePct: 25 });
    expect(statement.totals).toEqual({
      products: 2,
      qty: 15,
      revenueKobo: 80_000,
      cogsKobo: 55_000,
      profitKobo: 25_000,
      marginPct: 31.3,
    });
    expect(statement.unsoldCount).toBe(1);
  });

  it('sorts rows by revenue descending', () => {
    const summary = makeSummary();
    summary.products.reverse();
    const statement = buildProductSalesStatement(summary);
    expect(statement.rows[0]?.productId).toBe('p1');
  });

  it('exports a CSV with a balancing total row', () => {
    const csv = buildProductSalesCsv(buildProductSalesStatement(makeSummary()));
    expect(csv).toContain('"Rice, 5kg",RICE-5,10,600.00,400.00,200.00,33.3,75.0');
    expect(csv).toContain('Total,,15,800.00,550.00,250.00,31.3,100.0');
    expect(csv).toContain('Active products without sales,1');
  });
});
