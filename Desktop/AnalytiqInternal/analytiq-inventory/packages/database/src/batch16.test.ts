import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createCustomer, getCustomer } from './customers';
import { createProduct, getProduct, updateProduct } from './inventory';
import {
  createBrand,
  createCustomerGroup,
  createUnit,
  createWarranty,
  listBrands,
  updateBrand,
} from './masters';
import { getMenuReports } from './menuReports';
import { runMigrations } from './migrate';
import { createPurchase, receivePurchase } from './purchases';
import { createPurchaseReturn, listPurchaseReturns } from './purchaseReturns';
import { createSale } from './sales';
import { runSetup } from './service';
import { createStockAdjustment, listStockAdjustments } from './stockAdjustments';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.view',
  'sales.refund',
  'customers.manage',
  'suppliers.manage',
  'purchases.manage',
  'reports.view',
  'finance.manage',
];

function setupInput() {
  return {
    business: {
      name: 'Batch Sixteen Store',
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@batch16.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 0,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@batch16.ng', password: 'Admin1234' },
  };
}

function codeOf(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(codeOf(err)).toBe(code);
    return;
  }
  throw new Error(`Expected the call to fail with ${code}`);
}

function firstRow<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error('Expected at least one row');
  return row;
}

describe('batch 16 shop masters and floor documents', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let locationId: string;
  let productId: string;

  function onHand(id: string): number {
    const row = local.raw
      .prepare(
        'SELECT COALESCE(SUM(qty_delta), 0) AS n FROM stock_movements WHERE product_id = ? AND location_id = ?'
      )
      .get(id, locationId) as { n: number };
    return row.n;
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch16-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
    const def = local.raw
      .prepare('SELECT id FROM locations WHERE business_id = ? AND is_default = 1')
      .get(businessId) as { id: string };
    locationId = def.id;
    ({ id: productId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Bottled Water 75cl',
      unit: 'pack',
      costPriceKobo: 500,
      sellingPriceKobo: 1000,
      openingStock: 20,
    }));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  it('manages brands, units, warranties and customer groups', async () => {
    const brand = await createBrand(local, businessId, userId, GRANTS, { name: 'AquaPure', note: '' });
    await createUnit(local, businessId, userId, GRANTS, { name: 'Carton', shortName: 'ctn' });
    const warranty = await createWarranty(local, businessId, userId, GRANTS, {
      name: '6 months',
      durationDays: 180,
    });
    const group = await createCustomerGroup(local, businessId, userId, GRANTS, {
      name: 'Wholesale',
    });

    await expectCode(
      createBrand(local, businessId, userId, GRANTS, { name: 'aquapure' }),
      'MASTER_EXISTS'
    );
    await updateBrand(local, businessId, userId, GRANTS, brand.id, { note: 'Bottled locally' });
    expect(firstRow(await listBrands(local, businessId)).note).toBe('Bottled locally');

    const product = await getProduct(local, businessId, productId);
    expect(product.brandId).toBeNull();
    await updateProduct(local, businessId, userId, GRANTS, productId, {
      brandId: brand.id,
      warrantyId: warranty.id,
    });
    const tagged = await getProduct(local, businessId, productId);
    expect(tagged.brandName).toBe('AquaPure');
    expect(tagged.warrantyName).toBe('6 months');
    expect(tagged.brandId).toBe(brand.id);

    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Bola Stores',
      phone: '',
      email: '',
      address: '',
      note: '',
      creditLimitKobo: 0,
      groupId: group.id,
    });
    const customer = await getCustomer(local, businessId, customerId);
    expect(customer?.groupId).toBe(group.id);
    expect(customer?.groupName).toBe('Wholesale');

    await expectCode(
      createCustomer(local, businessId, userId, GRANTS, {
        name: 'Bad group',
        phone: '',
        email: '',
        address: '',
        note: '',
        creditLimitKobo: 0,
        groupId: 'missing-group',
      }),
      'CUSTOMER_GROUP_NOT_FOUND'
    );
  });

  it('posts a multi-line stock adjustment and refuses negative stock', async () => {
    const created = await createStockAdjustment(local, businessId, userId, GRANTS, {
      locationId,
      reason: 'Damage and recount',
      note: 'Weekly check',
      items: [
        { productId, qtyDelta: -3, note: 'Three damaged packs' },
        { productId, qtyDelta: 2, note: 'Found at the back' },
      ],
    });
    expect(created.reference).toBe('ADJ-000001');
    expect(onHand(productId)).toBe(19);

    const { items, total } = await listStockAdjustments(local, businessId, {});
    expect(total).toBe(1);
    const recorded = firstRow(items);
    expect(recorded.reference).toBe('ADJ-000001');
    expect(recorded.items).toHaveLength(2);
    expect(recorded.items.map((l) => l.qtyDelta)).toEqual([-3, 2]);

    await expectCode(
      createStockAdjustment(local, businessId, userId, GRANTS, {
        locationId,
        reason: 'Impossible',
        note: '',
        items: [{ productId, qtyDelta: -100, note: '' }],
      }),
      'NEGATIVE_STOCK'
    );
    await expectCode(
      createStockAdjustment(local, businessId, userId, ['reports.view'], {
        locationId,
        reason: 'No permission',
        note: '',
        items: [{ productId, qtyDelta: 1, note: '' }],
      }),
      'FORBIDDEN'
    );
  });

  it('returns received purchase stock and caps the returnable quantity', async () => {
    const purchase = await createPurchase(local, businessId, userId, GRANTS, {
      supplierId: null,
      locationId,
      reference: '',
      note: '',
      taxKobo: 0,
      amountPaidKobo: 0,
      items: [{ productId, qty: 10, unitCostKobo: 500, batchNo: '', expiryDate: null }],
    });
    await receivePurchase(local, businessId, userId, GRANTS, purchase.id);
    expect(onHand(productId)).toBe(30);

    const ret = await createPurchaseReturn(local, businessId, userId, GRANTS, {
      purchaseId: purchase.id,
      reason: 'Crushed packs',
      note: '',
      items: [{ productId, qty: 4 }],
    });
    expect(ret.reference).toBe('PRT-000001');
    expect(ret.totalKobo).toBe(2000);
    expect(onHand(productId)).toBe(26);

    const listed = await listPurchaseReturns(local, businessId, {});
    expect(listed.total).toBe(1);
    const recorded = firstRow(listed.items);
    expect(recorded.purchaseReference).toBe(purchase.reference);
    expect(firstRow(recorded.items).qty).toBe(4);

    await expectCode(
      createPurchaseReturn(local, businessId, userId, GRANTS, {
        purchaseId: purchase.id,
        reason: 'Too many',
        note: '',
        items: [{ productId, qty: 7 }],
      }),
      'RETURN_QTY_EXCEEDED'
    );
    await expectCode(
      createPurchaseReturn(local, businessId, userId, ['reports.view'], {
        purchaseId: purchase.id,
        reason: 'No permission',
        note: '',
        items: [{ productId, qty: 1 }],
      }),
      'FORBIDDEN'
    );
  });

  it('derives the extra reports from the ledgers', async () => {
    const group = await createCustomerGroup(local, businessId, userId, GRANTS, { name: 'Retail' });
    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Chidi Okeke',
      phone: '08012345678',
      email: '',
      address: '',
      note: '',
      creditLimitKobo: 0,
      groupId: group.id,
    });

    const sale = await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 2000 }],
      customerId,
    });

    const purchase = await createPurchase(local, businessId, userId, GRANTS, {
      supplierId: null,
      locationId,
      reference: '',
      note: '',
      taxKobo: 250,
      amountPaidKobo: 1000,
      items: [{ productId, qty: 10, unitCostKobo: 500, batchNo: '', expiryDate: null }],
    });
    await receivePurchase(local, businessId, userId, GRANTS, purchase.id);

    await createStockAdjustment(local, businessId, userId, GRANTS, {
      locationId,
      reason: 'Recount',
      note: '',
      items: [{ productId, qtyDelta: 1, note: '' }],
    });

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getTime() + 60_000);
    const report = getMenuReports(local, businessId, GRANTS, { from, to });

    expect(report.purchaseSale.salesKobo).toBe(sale.totalKobo);
    expect(report.purchaseSale.salesCount).toBe(1);
    expect(report.purchaseSale.purchaseKobo).toBe(5250);
    expect(report.purchaseSale.purchaseCount).toBe(1);

    expect(report.tax.outputKobo).toBe(0);
    expect(report.tax.inputKobo).toBe(250);
    expect(report.tax.netKobo).toBe(-250);

    const customer = firstRow(report.customers);
    expect(customer.name).toBe('Chidi Okeke');
    expect(customer.groupName).toBe('Retail');
    const groupRow = firstRow(report.customerGroups);
    expect(groupRow.name).toBe('Retail');
    expect(groupRow.customers).toBe(1);
    expect(groupRow.salesKobo).toBe(sale.totalKobo);

    expect(firstRow(report.stockAdjustments).reference).toBe('ADJ-000001');
    expect(firstRow(report.stockAdjustments).lines).toBe(1);
    expect(firstRow(report.productPurchases).qty).toBe(10);
    expect(firstRow(report.productPurchases).costKobo).toBe(5000);
    expect(firstRow(report.purchasePayments).balanceKobo).toBe(4250);
    expect(report.sellPayments.find((p) => p.method === 'cash')?.amountKobo).toBe(2000);
    const register = firstRow(report.registers);
    expect(register.locationName).toBe('Main Store');
    expect(register.transactions).toBe(1);
    const rep = firstRow(report.salesReps);
    expect(rep.transactions).toBe(1);
    expect(rep.grossKobo).toBe(sale.totalKobo);

    await expectCode(
      Promise.resolve().then(() => getMenuReports(local, businessId, [], { from, to })),
      'FORBIDDEN'
    );
  });
});
