import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createCustomer } from './customers';
import { createProduct } from './inventory';
import { runMigrations } from './migrate';
import { getReportsSummary } from './reports';
import { createSale, refundSale } from './sales';
import { runSetup } from './service';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.refund',
  'sales.view',
  'customers.manage',
  'reports.view',
];

function setupInput() {
  return {
    business: {
      name: 'Test Mart',
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@testmart.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@testmart.ng', password: 'Admin1234' },
  };
}

describe('batch 9 reports', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let productId: string;
  let customerId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-reports-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
    ({ id: productId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Indomie 70g',
      sku: 'IND-70',
      sellingPriceKobo: 45000,
      costPriceKobo: 32000,
      openingStock: 100,
    }));
    ({ id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Bola Buyer',
      creditLimitKobo: 500_000,
    }));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  async function seedSales(): Promise<void> {
    // 2 × 45000 + 7.5% VAT = 96750, paid cash; later refunded.
    const cash = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 100_000 }],
    });
    await refundSale(local, businessId, userId, GRANTS, cash.id, {
      reason: 'customer changed mind',
    });

    // 1 × 45000 + VAT = 48375 on credit.
    await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 1 }],
      payments: [{ method: 'credit', amountKobo: 48_375 }],
      customerId,
    });
  }

  it('summarises completed sales, refunds, profit and payment mix', async () => {
    await seedSales();
    const summary = getReportsSummary(local, businessId, GRANTS, {});

    expect(summary.sales.transactions).toBe(1);
    expect(summary.sales.grossKobo).toBe(48_375);
    expect(summary.sales.taxKobo).toBe(3_375);
    expect(summary.sales.netKobo).toBe(45_000);
    expect(summary.sales.cogsKobo).toBe(32_000);
    expect(summary.sales.grossProfitKobo).toBe(13_000);
    expect(summary.sales.averageBasketKobo).toBe(48_375);
    expect(summary.sales.refundCount).toBe(1);
    expect(summary.sales.refundsKobo).toBe(96_750);

    expect(summary.payments).toEqual([{ method: 'credit', count: 1, amountKobo: 48_375 }]);
    expect(summary.credit.outstandingKobo).toBe(48_375);
    expect(summary.credit.activeCustomers).toBe(1);
  });

  it('reports top products, customers and cashiers', async () => {
    await seedSales();
    const summary = getReportsSummary(local, businessId, GRANTS, { topLimit: 5 });

    expect(summary.topProducts[0]).toMatchObject({
      productId,
      qty: 1,
      revenueKobo: 45_000,
      profitKobo: 13_000,
    });
    expect(summary.topCustomers[0]).toMatchObject({
      customerId,
      transactions: 1,
      totalKobo: 48_375,
    });
    expect(summary.cashiers[0]).toMatchObject({ customerId: userId, transactions: 1 });
  });

  it('values inventory and lists the daily trend', async () => {
    await seedSales();
    const summary = getReportsSummary(local, businessId, GRANTS, {});

    // 100 opening − 2 sold + 2 refunded − 1 on credit = 99 on hand.
    expect(summary.inventory.productCount).toBe(1);
    expect(summary.inventory.costValueKobo).toBe(99 * 32_000);
    expect(summary.inventory.retailValueKobo).toBe(99 * 45_000);
    expect(summary.inventory.lowStockCount).toBe(0);

    const today = summary.daily[summary.daily.length - 1];
    expect(today).toBeDefined();
    expect(today?.transactions).toBe(1);
    expect(today?.grossKobo).toBe(48_375);
  });

  it('honours the date range and rejects an inverted range', async () => {
    await seedSales();
    const tomorrow = new Date(Date.now() + 86_400_000);
    const future = getReportsSummary(local, businessId, GRANTS, { from: tomorrow, to: tomorrow });
    expect(future.sales.transactions).toBe(0);
    expect(future.daily.every((d) => d.transactions === 0)).toBe(true);

    expect(() =>
      getReportsSummary(local, businessId, GRANTS, {
        from: new Date('2026-02-01T00:00:00Z'),
        to: new Date('2026-01-01T00:00:00Z'),
      })
    ).toThrow(/start date/);
  });

  it('requires the reports.view permission', () => {
    expect(() => getReportsSummary(local, businessId, [], {})).toThrow(/reports\.view/);
  });
});
