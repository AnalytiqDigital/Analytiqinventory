import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import {
  adjustStock,
  archiveProduct,
  countStock,
  createCategory,
  createProduct,
  getLevels,
  getProduct,
  listMovements,
  listProducts,
  restoreProduct,
  updateProduct,
} from './inventory';
import { runMigrations } from './migrate';
import { runSetup } from './service';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'staff.manage',
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

describe('batch 4 products + inventory ledger', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch4-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  it('creates a product with opening stock and derives on-hand from the ledger', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Indomie 70g',
      sku: 'IND-70',
      sellingPriceKobo: 45000,
      costPriceKobo: 32000,
      reorderLevel: 10,
      openingStock: 100,
    });
    const detail = await getProduct(local, businessId, id);
    expect(detail.onHand).toBe(100);
    expect(detail.levels).toHaveLength(1);
    expect(detail.levels[0]?.onHand).toBe(100);
    const { items } = await listProducts(local, businessId, {});
    expect(items).toHaveLength(1);
    expect(items[0]?.lowStock).toBe(false);
  });

  it('rejects duplicate SKU / barcode within a business', async () => {
    await createProduct(local, businessId, userId, GRANTS, { name: 'Milk', sku: 'MLK-1' });
    await expect(
      createProduct(local, businessId, userId, GRANTS, { name: 'Milk 2', sku: 'MLK-1' }),
    ).rejects.toThrow(/SKU/i);
    await createProduct(local, businessId, userId, GRANTS, { name: 'Sugar', barcode: 'BC1' });
    await expect(
      createProduct(local, businessId, userId, GRANTS, { name: 'Sugar 2', barcode: 'BC1' }),
    ).rejects.toThrow(/barcode/i);
  });

  it('rejects non-positive prices and updates product fields', async () => {
    await expect(
      createProduct(local, businessId, userId, GRANTS, { name: 'Bad', costPriceKobo: -5 }),
    ).rejects.toThrow();
    const { id } = await createProduct(local, businessId, userId, GRANTS, { name: 'Rice' });
    await updateProduct(local, businessId, userId, GRANTS, id, {
      sellingPriceKobo: 90000,
      reorderLevel: 5,
    });
    const detail = await getProduct(local, businessId, id);
    expect(detail.sellingPriceKobo).toBe(90000);
    expect(detail.reorderLevel).toBe(5);
  });

  it('categories are unique per business and attach to products', async () => {
    const cat = await createCategory(local, businessId, userId, GRANTS, { name: 'Noodles' });
    await expect(
      createCategory(local, businessId, userId, GRANTS, { name: 'Noodles' }),
    ).rejects.toThrow(/already exists/i);
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Indomie',
      categoryId: cat.id,
    });
    const detail = await getProduct(local, businessId, id);
    expect(detail.categoryName).toBe('Noodles');
  });

  it('archives hide products from default listing and restore brings them back', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, { name: 'Bread' });
    await archiveProduct(local, businessId, userId, GRANTS, id);
    expect((await listProducts(local, businessId, {})).items).toHaveLength(0);
    expect((await listProducts(local, businessId, { includeInactive: true })).items).toHaveLength(1);
    await restoreProduct(local, businessId, userId, GRANTS, id);
    expect((await listProducts(local, businessId, {})).items).toHaveLength(1);
  });

  it('adjusts stock up and down, and never below zero', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Beans',
      openingStock: 50,
    });
    const up = await adjustStock(local, businessId, userId, GRANTS, {
      productId: id,
      quantityDelta: 25,
      reason: 'Found extra bag',
    });
    expect(up.qtyAfter).toBe(75);
    await expect(
      adjustStock(local, businessId, userId, GRANTS, {
        productId: id,
        quantityDelta: -100,
        reason: 'Too much out',
      }),
    ).rejects.toThrow(/below zero/i);
    // Stock unchanged after the rejected adjustment.
    expect((await getProduct(local, businessId, id)).onHand).toBe(75);
  });

  it('stock count snaps to the counted quantity via a delta movement', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Garri',
      openingStock: 40,
    });
    const res = await countStock(local, businessId, userId, GRANTS, {
      productId: id,
      countedQty: 33,
      reason: 'Month-end count',
    });
    expect(res.qtyAfter).toBe(33);
    expect(res.qtyDelta).toBe(-7);
    const { items } = await listMovements(local, businessId, { productId: id });
    expect(items.map((m) => m.kind)).toEqual(['count', 'opening']);
  });

  it('levels report per-location totals and flag low stock', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Oil',
      reorderLevel: 10,
      openingStock: 5,
    });
    const { items, total } = await getLevels(local, businessId, {});
    expect(total).toBe(items.length);
    const row = items.find((i) => i.productId === id);
    expect(row?.onHand).toBe(5);
    expect(row?.low).toBe(true);
    // Regression: the lowOnly COUNT subquery must not reference the `onHand`
    // SELECT alias, which only exists in the outer rows query.
    const low = await getLevels(local, businessId, { lowOnly: true });
    expect(low.total).toBe(low.items.length);
    expect(low.items.some((i) => i.productId === id)).toBe(true);
    const ok = await getLevels(local, businessId, { lowOnly: true, page: 99 });
    expect(ok.items).toHaveLength(0);
  });

  it('enforces permissions on product and stock writes', async () => {
    await expect(
      createProduct(local, businessId, userId, [], { name: 'Nope' }),
    ).rejects.toThrow(/permission/i);
    const { id } = await createProduct(local, businessId, userId, GRANTS, { name: 'Ok' });
    await expect(
      adjustStock(local, businessId, userId, [], {
        productId: id,
        quantityDelta: 1,
        reason: 'Trying without permission',
      }),
    ).rejects.toThrow(/permission/i);
  });
});
