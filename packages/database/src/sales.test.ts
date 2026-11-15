import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createProduct, getProduct } from './inventory';
import { runMigrations } from './migrate';
import { createSale, getSale, listSales, refundSale, voidSale } from './sales';
import { runSetup } from './service';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.refund',
  'sales.view',
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

describe('batch 5 POS + cash register', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch5-'));
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
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  it('completes a cash sale and decrements stock', async () => {
    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 100000 }],
    });
    expect(res.receiptNo).toMatch(/^R-/);
    // 2 × 45000 = 90000 + 7.5% VAT (6750) = 96750; paid 100000 → change 3250
    expect(res.totalKobo).toBe(96750);
    expect(res.changeKobo).toBe(3250);

    const detail = await getProduct(local, businessId, productId);
    expect(detail.onHand).toBe(98);

    const sale = await getSale(local, businessId, GRANTS, res.id);
    expect(sale.items).toHaveLength(1);
    expect(sale.payments).toHaveLength(1);
    expect(sale.status).toBe('completed');
  });

  it('applies line and header discounts', async () => {
    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2, lineDiscountKobo: 5000 }],
      headerDiscountKobo: 10000,
      payments: [{ method: 'pos', amountKobo: 100000, reference: 'POS-123' }],
    });
    // gross 90000 − line 5000 − header 10000 = 75000 + VAT 5625 = 80625
    expect(res.totalKobo).toBe(80625);
    const sale = await getSale(local, businessId, GRANTS, res.id);
    expect(sale.lineDiscountKobo).toBe(5000);
    expect(sale.headerDiscountKobo).toBe(10000);
  });

  it('supports split tender across methods', async () => {
    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 1 }],
      payments: [
        { method: 'cash', amountKobo: 20000 },
        { method: 'transfer', amountKobo: 28375, reference: 'TRF-1' },
      ],
    });
    // 45000 + VAT 3375 = 48375
    expect(res.totalKobo).toBe(48375);
    expect(res.changeKobo).toBe(0);
  });

  it('rejects underpayment and insufficient stock', async () => {
    await expect(
      createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'cash', amountKobo: 100 }],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_PAYMENT' });

    await expect(
      createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1000 }],
        payments: [{ method: 'cash', amountKobo: 999_999_999 }],
      }),
    ).rejects.toMatchObject({ code: 'NEGATIVE_STOCK' });
  });

  it('requires exact payment for credit sales', async () => {
    await expect(
      createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'credit', amountKobo: 99999 }],
      }),
    ).rejects.toMatchObject({ code: 'CREDIT_MUST_MATCH' });

    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 1 }],
      payments: [{ method: 'credit', amountKobo: 48375 }],
    });
    expect(res.changeKobo).toBe(0);
  });

  it('refunds restock and block double reversal', async () => {
    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 5 }],
      payments: [{ method: 'cash', amountKobo: 300000 }],
    });
    expect((await getProduct(local, businessId, productId)).onHand).toBe(95);

    await refundSale(local, businessId, userId, GRANTS, res.id, { reason: 'Customer return' });
    expect((await getProduct(local, businessId, productId)).onHand).toBe(100);

    const sale = await getSale(local, businessId, GRANTS, res.id);
    expect(sale.status).toBe('refunded');
    expect(sale.reversal?.reason).toBe('Customer return');

    await expect(
      refundSale(local, businessId, userId, GRANTS, res.id, { reason: 'Again' }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
  });

  it('voids a sale and lists history', async () => {
    const res = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 1 }],
      payments: [{ method: 'cash', amountKobo: 50000 }],
    });
    await voidSale(local, businessId, userId, GRANTS, res.id, { reason: 'Wrong item scanned' });
    const sale = await getSale(local, businessId, GRANTS, res.id);
    expect(sale.status).toBe('voided');

    const { items, total } = await listSales(local, businessId, GRANTS, {});
    expect(total).toBe(1);
    expect(items[0]?.receiptNo).toBe(res.receiptNo);
  });

  it('enforces permissions', async () => {
    await expect(
      createSale(local, businessId, userId, [], {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'cash', amountKobo: 50000 }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
