import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { getBusinessProfile, runSetup } from './service';
import { getProduct, productByBarcode } from './inventory';
import {
  importContacts,
  importOpeningStock,
  importProducts,
  importPurchases,
  importSales,
  parseImportDate,
} from './imports';
import { listCustomers } from './customers';
import { listSuppliers } from './suppliers';
import { createCustomerGroup } from './masters';
import { runMigrations } from './migrate';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.refund',
  'sales.view',
  'purchases.manage',
  'suppliers.manage',
  'customers.manage',
];

function setupInput() {
  return {
    business: {
      name: 'Import Mart',
      type: 'retail',
      address: '12 Market Road',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@importmart.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@importmart.ng', password: 'Admin1234' },
  };
}

let dir: string;
let local: LocalDb;
let businessId: string;
let userId: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'analytiq-imports-'));
  runMigrations(join(dir, 'local.db'));
  local = openLocalDb(join(dir, 'local.db'));
  ({ businessId, userId } = await runSetup(local, setupInput()));
});

afterEach(() => {
  closeLocalDb(local);
});

async function seedProduct(): Promise<string> {
  const result = await importProducts(local, businessId, userId, GRANTS, {
    rows: [
      {
        name: 'Indomie 70g',
        sku: 'IND-70',
        barcode: '6151100012345',
        category: 'Noodles',
        unit: 'pcs',
        costPriceKobo: 32_000,
        sellingPriceKobo: 45_000,
        reorderLevel: 10,
        openingStock: 100,
        taxCategory: '',
      },
    ],
  });
  expect(result.created).toBe(1);
  const found = await productByBarcode(local, businessId, '6151100012345');
  return found!.id;
}

describe('parseImportDate', () => {
  it('reads ISO datetimes, plain dates and Nigerian d/m/Y dates', () => {
    expect(parseImportDate('2026-11-03T14:05:00+01:00')?.toISOString()).toBe(
      '2026-11-03T13:05:00.000Z'
    );
    expect(parseImportDate('2026-11-03')?.getDate()).toBe(3);
    expect(parseImportDate('03/11/2026')?.getMonth()).toBe(10);
    expect(parseImportDate('03/11/2026 14:05')?.getHours()).toBe(14);
    expect(parseImportDate('not a date')).toBeNull();
  });
});

describe('bulk import: products', () => {
  it('creates products, auto-creates categories and seeds opening stock', async () => {
    const productId = await seedProduct();
    const detail = await getProduct(local, businessId, productId);
    expect(detail.onHand).toBe(100);
    expect(detail.categoryName).toBe('Noodles');
    expect((await productByBarcode(local, businessId, 'IND-70'))?.id).toBe(productId);
  });

  it('rejects a file with duplicate or existing SKUs without writing anything', async () => {
    await seedProduct();
    const result = await importProducts(local, businessId, userId, GRANTS, {
      rows: [
        {
          name: 'Another',
          sku: 'NEW-1',
          barcode: '',
          category: '',
          unit: 'pcs',
          costPriceKobo: 0,
          sellingPriceKobo: 0,
          reorderLevel: 0,
          openingStock: 0,
          taxCategory: '',
        },
        {
          name: 'Clash',
          sku: 'IND-70',
          barcode: '',
          category: '',
          unit: 'pcs',
          costPriceKobo: 0,
          sellingPriceKobo: 0,
          reorderLevel: 0,
          openingStock: 0,
          taxCategory: '',
        },
      ],
    });
    expect(result.created).toBe(0);
    expect(result.errors[0]?.code).toBe('SKU_EXISTS');
    expect(await productByBarcode(local, businessId, 'NEW-1')).toBeNull();
  });

  it('requires products.manage', async () => {
    await expect(
      importProducts(local, businessId, userId, [], { rows: [{ name: 'Nope' }] })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('bulk import: purchases', () => {
  it('creates draft purchases and receives them into stock when asked', async () => {
    const productId = await seedProduct();
    const result = await importPurchases(local, businessId, userId, GRANTS, {
      rows: [
        {
          reference: 'PUR-1001',
          supplier: 'Peak Foods',
          supplierPhone: '+2348011112222',
          date: '2026-11-01',
          sku: 'IND-70',
          qty: 40,
          unitCostKobo: 30_000,
          taxKobo: 0,
          note: 'November restock',
          received: true,
        },
      ],
    });
    expect(result).toMatchObject({ created: 1, failed: 0 });
    const detail = await getProduct(local, businessId, productId);
    expect(detail.onHand).toBe(140);
    expect(detail.costPriceKobo).toBe(30_000);
  });

  it('refuses to import the same reference twice', async () => {
    await seedProduct();
    const payload = {
      rows: [
        {
          reference: 'PUR-1001',
          supplier: 'Peak Foods',
          supplierPhone: '',
          date: '',
          sku: 'IND-70',
          qty: 1,
          unitCostKobo: 1000,
          taxKobo: 0,
          note: '',
          received: false,
        },
      ],
    };
    expect((await importPurchases(local, businessId, userId, GRANTS, payload)).created).toBe(1);
    const again = await importPurchases(local, businessId, userId, GRANTS, payload);
    expect(again.created).toBe(0);
    expect(again.errors[0]?.code).toBe('PURCHASE_REFERENCE_EXISTS');
  });
});

describe('bulk import: sales', () => {
  it('groups rows by receipt, backdates the sale and stores the external reference', async () => {
    await seedProduct();
    const result = await importSales(local, businessId, userId, GRANTS, {
      rows: [
        {
          receipt: 'INV-0001',
          date: '2026-11-02',
          sku: 'IND-70',
          qty: 2,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 0,
          tender: 'cash',
          customer: 'Ngozi Okafor',
          taxKobo: 0,
        },
        {
          receipt: 'INV-0001',
          date: '2026-11-02',
          sku: 'IND-70',
          qty: 1,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 5_000,
          tender: 'cash',
          customer: 'Ngozi Okafor',
          taxKobo: 0,
        },
      ],
    });
    expect(result).toMatchObject({ created: 1, failed: 0 });

    const row = local.raw
      .prepare('SELECT total_kobo AS total, external_ref AS ref, created_at AS at FROM sales')
      .get() as { total: number; ref: string; at: number };
    expect(row.ref).toBe('INV-0001');
    expect(row.total).toBe(130_000);

    const product = await productByBarcode(local, businessId, 'IND-70');
    expect(product?.onHand).toBe(97);
  });

  it('reports already-imported receipts instead of duplicating them', async () => {
    await seedProduct();
    const payload = {
      rows: [
        {
          receipt: 'INV-0001',
          date: '',
          sku: 'IND-70',
          qty: 1,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 0,
          tender: 'cash',
          customer: '',
          taxKobo: null,
        },
      ],
    };
    expect((await importSales(local, businessId, userId, GRANTS, payload)).created).toBe(1);
    const again = await importSales(local, businessId, userId, GRANTS, payload);
    expect(again.created).toBe(0);
    expect(again.errors[0]?.code).toBe('SALE_REFERENCE_EXISTS');
  });

  it('imports the good groups and reports the one that runs out of stock', async () => {
    await seedProduct();
    const result = await importSales(local, businessId, userId, GRANTS, {
      rows: [
        {
          receipt: 'INV-OK',
          date: '',
          sku: 'IND-70',
          qty: 5,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 0,
          tender: 'cash',
          customer: '',
          taxKobo: null,
        },
        {
          receipt: 'INV-BAD',
          date: '',
          sku: 'IND-70',
          qty: 500,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 0,
          tender: 'cash',
          customer: '',
          taxKobo: null,
        },
      ],
    });
    expect(result.created).toBe(1);
    expect(result.errors[0]?.code).toBe('NEGATIVE_STOCK');
  });

  it('creates missing customers so a credit import is attributed', async () => {
    await seedProduct();
    const result = await importSales(local, businessId, userId, GRANTS, {
      rows: [
        {
          receipt: 'INV-CR',
          date: '',
          sku: 'IND-70',
          qty: 2,
          unitPriceKobo: 45_000,
          lineDiscountKobo: 0,
          tender: 'credit',
          customer: 'Chidi Stores',
          taxKobo: null,
        },
      ],
    });
    expect(result.created).toBe(1);
    const customer = local.raw
      .prepare('SELECT name FROM customers WHERE business_id = ?')
      .get(businessId) as { name: string };
    expect(customer.name).toBe('Chidi Stores');
  });
});

describe('business profile', () => {
  it('returns the receipt header fields for the business', async () => {
    const profile = await getBusinessProfile(local, businessId);
    expect(profile).toMatchObject({
      name: 'Import Mart',
      phone: '+2348012345678',
      taxLabel: 'VAT',
    });
  });
});

describe('bulk import: opening stock', () => {
  it('sets absolute on-hand quantities and reports unmatched products', async () => {
    const productId = await seedProduct();
    expect((await getProduct(local, businessId, productId)).onHand).toBe(100);

    const up = await importOpeningStock(local, businessId, userId, GRANTS, {
      rows: [{ sku: 'IND-70', qty: 150, barcode: '', name: '', location: '' }],
    });
    expect(up).toMatchObject({ created: 1, failed: 0, errors: [] });
    expect((await getProduct(local, businessId, productId)).onHand).toBe(150);

    // Re-importing the same count must not double the stock.
    const again = await importOpeningStock(local, businessId, userId, GRANTS, {
      rows: [{ barcode: '6151100012345', qty: 150, sku: '', name: '', location: '' }],
    });
    expect(again.created).toBe(1);
    expect((await getProduct(local, businessId, productId)).onHand).toBe(150);

    const missing = await importOpeningStock(local, businessId, userId, GRANTS, {
      rows: [{ name: 'Ghost Product', qty: 5, sku: '', barcode: '', location: '' }],
    });
    expect(missing.created).toBe(0);
    expect(missing.failed).toBe(1);
    expect(missing.errors[0]?.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('requires the inventory.adjust permission', async () => {
    await seedProduct();
    await expect(
      importOpeningStock(local, businessId, userId, [], {
        rows: [{ sku: 'IND-70', qty: 1, barcode: '', name: '', location: '' }],
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('bulk import: contacts', () => {
  it('creates customers and suppliers in one file and assigns groups by name', async () => {
    await createCustomerGroup(local, businessId, userId, GRANTS, {
      name: 'Wholesale',
      note: '',
    });

    const result = await importContacts(local, businessId, userId, GRANTS, {
      rows: [
        {
          name: 'Ada Obi',
          type: 'customer',
          phone: '08030000000',
          email: 'ada@example.com',
          address: 'Lagos',
          group: 'Wholesale',
        },
        {
          name: 'Peak Foods',
          type: 'supplier',
          phone: '08055550000',
          email: 'sales@peak.example',
          address: 'Onitsha',
          group: '',
        },
      ],
    });
    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);

    const customers = await listCustomers(local, businessId, { search: 'Ada', limit: 10, offset: 0 });
    expect(customers.items[0]).toMatchObject({ name: 'Ada Obi', groupName: 'Wholesale' });
    const suppliersPage = await listSuppliers(local, businessId, { search: 'Peak', limit: 10, offset: 0 });
    expect(suppliersPage.items[0]).toMatchObject({ name: 'Peak Foods' });
  });

  it('reports unknown groups and missing permissions per file', async () => {
    const groups = await importContacts(local, businessId, userId, GRANTS, {
      rows: [
        {
          name: 'No Group Person',
          type: 'customer',
          phone: '',
          email: '',
          address: '',
          group: 'Missing',
        },
      ],
    });
    expect(groups.created).toBe(0);
    expect(groups.errors[0]?.code).toBe('CUSTOMER_GROUP_NOT_FOUND');

    await expect(
      importContacts(local, businessId, userId, ['suppliers.manage'], {
        rows: [{ name: 'X', type: 'customer', phone: '', email: '', address: '', group: '' }],
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
