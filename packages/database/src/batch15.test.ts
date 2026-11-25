import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBatchIntake, listBatches, listExpiryAlerts } from './batches';
import { decryptBuffer, runEncryptedCloudBackup, setCloudBackupSettings } from './cloudBackup';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createCustomer } from './customers';
import { listDebtors, sendDebtorReminders } from './debtors';
import { createProduct } from './inventory';
import { createLocation } from './locations';
import { getLoyaltySettings, listLoyaltyEntries, setLoyaltySettings } from './loyalty';
import { runMigrations } from './migrate';
import { getModuleInstallView, setModuleInstall } from './modules';
import { createPriceTier, listPriceTiers, setTierPrices } from './priceTiers';
import { createSaleReturn, listSaleReturns, lookupSaleByReceipt } from './returns';
import { createSale } from './sales';
import { authenticate, login, runSetup } from './service';
import { createStockTransfer, listStockTransfers } from './transfers';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.view',
  'sales.refund',
  'customers.manage',
  'reports.view',
  'settings.manage',
];

function setupInput() {
  return {
    business: {
      name: 'Batch Fifteen Pharmacy',
      type: 'pharmacy',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@batch15.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 0,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@batch15.ng', password: 'Admin1234' },
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

describe('batch 15 business pack', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let locationId: string;
  let batchProductId: string;
  let plainProductId: string;

  function onHand(productId: string, locId: string): number {
    const row = local.raw
      .prepare(
        'SELECT COALESCE(SUM(qty_delta), 0) AS n FROM stock_movements WHERE product_id = ? AND location_id = ?'
      )
      .get(productId, locId) as { n: number };
    return row.n;
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch15-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
    const def = local.raw
      .prepare('SELECT id FROM locations WHERE business_id = ? AND is_default = 1')
      .get(businessId) as { id: string };
    locationId = def.id;
    ({ id: batchProductId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Paracetamol 500mg',
      unit: 'pack',
      costPriceKobo: 30000,
      sellingPriceKobo: 45000,
      openingStock: 0,
      trackBatches: true,
      nearExpiryDays: 30,
    }));
    ({ id: plainProductId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Exercise Book',
      unit: 'pcs',
      costPriceKobo: 1000,
      sellingPriceKobo: 2000,
      openingStock: 50,
    }));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  async function intake(batchNo: string, expiryDate: string, qty: number): Promise<string> {
    const { batchId } = await createBatchIntake(local, businessId, userId, GRANTS, {
      productId: batchProductId,
      batchNo,
      expiryDate,
      qty,
    });
    return batchId;
  }

  function firstRow<T>(rows: T[]): T {
    const [row] = rows;
    if (!row) throw new Error('Expected at least one row');
    return row;
  }

  function cashSale(items: Array<{ productId: string; qty: number }>, extra: object = {}) {
    return createSale(local, businessId, userId, GRANTS, {
      items,
      payments: [{ method: 'cash', amountKobo: 1_000_000 }],
      ...extra,
    });
  }

  it('records a batch intake and lists it with remaining stock', async () => {
    await intake('B-1', '2026-12-01T00:00:00.000Z', 10);
    const { items } = await listBatches(local, businessId, { search: 'Paracetamol' });
    expect(items).toHaveLength(1);
    expect(firstRow(items).batchNo).toBe('B-1');
    expect(firstRow(items).remaining).toBe(10);
    expect(onHand(batchProductId, locationId)).toBe(10);

    const alerts = await listExpiryAlerts(local, businessId, 30);
    expect(alerts.map((b) => b.batchNo)).toContain('B-1');
  });

  it('puts opening stock in a batch carrying the pack dates', async () => {
    // Batch dates are stored to the second, so build them from whole seconds.
    const nowSeconds = Math.floor(Date.now() / 1000) * 1000;
    const expiry = new Date(nowSeconds + 10 * 86_400_000).toISOString();
    const made = new Date(nowSeconds - 200 * 86_400_000).toISOString();
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Amoxicillin 250mg',
      unit: 'pack',
      costPriceKobo: 40000,
      sellingPriceKobo: 60000,
      openingStock: 12,
      trackBatches: true,
      nearExpiryDays: 30,
      manufacturedDate: made,
      expiryDate: expiry,
    });

    const { items } = await listBatches(local, businessId, { productId: id });
    expect(items).toHaveLength(1);
    expect(firstRow(items).remaining).toBe(12);
    expect(firstRow(items).manufacturedDate).toBe(made);
    expect(firstRow(items).expiryDate).toBe(expiry);

    const alerts = await listExpiryAlerts(local, businessId, 30);
    expect(alerts.some((b) => b.productId === id && b.status === 'expiring')).toBe(true);
  });

  it('sells the earliest-expiring batch first', async () => {
    await intake('SOON', '2026-12-01T00:00:00.000Z', 10);
    await intake('LATER', '2027-06-01T00:00:00.000Z', 20);

    const sale = await cashSale([{ productId: batchProductId, qty: 12 }]);
    expect(sale.totalKobo).toBe(540000);

    const { items } = await listBatches(local, businessId, { includeEmpty: true });
    const byNo = new Map(items.map((b) => [b.batchNo, b]));
    expect(byNo.get('SOON')?.remaining).toBe(0);
    expect(byNo.get('LATER')?.remaining).toBe(18);
  });

  it('marks an expired batch as expired in alerts', async () => {
    await intake('OLD', '2020-01-01T00:00:00.000Z', 4);
    const { items } = await listBatches(local, businessId, {});
    expect(firstRow(items).status).toBe('expired');
    const alerts = await listExpiryAlerts(local, businessId, 30);
    expect(alerts.some((b) => b.status === 'expired' && b.batchNo === 'OLD')).toBe(true);
  });

  it('uses a customer price tier when no price was typed', async () => {
    const tier = await createPriceTier(local, businessId, userId, GRANTS, {
      name: 'Wholesale',
      description: '',
      isDefault: false,
    });
    const saved = await setTierPrices(local, businessId, userId, GRANTS, tier.id, {
      prices: [{ productId: plainProductId, priceKobo: 1500 }],
    });
    expect(saved.saved).toBe(1);
    expect(firstRow(await listPriceTiers(local, businessId)).priceCount).toBe(1);

    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Chika Bulk',
      priceTierId: tier.id,
    });
    const sale = await cashSale([{ productId: plainProductId, qty: 4 }], { customerId });
    expect(sale.totalKobo).toBe(6000);

    const walkIn = await cashSale([{ productId: plainProductId, qty: 4 }]);
    expect(walkIn.totalKobo).toBe(8000);
  });

  it('earns and redeems loyalty points', async () => {
    await setLoyaltySettings(local, businessId, userId, GRANTS, {
      enabled: true,
      earnKoboPerPoint: 1000,
      pointValueKobo: 100,
    });
    expect(getLoyaltySettings(local, businessId).enabled).toBe(true);
    await intake('LOYAL', '2027-06-01T00:00:00.000Z', 10);
    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Ada Points',
    });

    await cashSale([{ productId: batchProductId, qty: 1 }], { customerId });
    const afterFirst = await listLoyaltyEntries(local, businessId, customerId);
    expect(afterFirst.balance).toBe(45);

    const redeemed = await cashSale([{ productId: batchProductId, qty: 1 }], {
      customerId,
      redeemPoints: 20,
    });
    expect(redeemed.totalKobo).toBe(43000);
    const afterSecond = await listLoyaltyEntries(local, businessId, customerId);
    expect(afterSecond.balance).toBe(68);
  });

  it('refunds part of a receipt, restocks it and blocks over-returns', async () => {
    await intake('SOON', '2026-12-01T00:00:00.000Z', 10);
    await intake('LATER', '2027-06-01T00:00:00.000Z', 20);
    const sale = await cashSale([{ productId: batchProductId, qty: 12 }]);
    expect(onHand(batchProductId, locationId)).toBe(18);

    const lookup = await lookupSaleByReceipt(local, businessId, GRANTS, sale.receiptNo);
    const line = firstRow(lookup.items);
    const result = await createSaleReturn(local, businessId, userId, GRANTS, {
      saleId: sale.id,
      items: [{ saleItemId: line.id, qty: 2 }],
      reason: 'Customer brought two packs back',
      refundMethod: 'cash',
      kind: 'refund',
    });
    expect(result.refundKobo).toBe(90000);
    expect(onHand(batchProductId, locationId)).toBe(20);
    const { items } = await listBatches(local, businessId, { includeEmpty: true });
    expect(items.reduce((sum, b) => sum + b.remaining, 0)).toBe(20);

    await expectCode(
      createSaleReturn(local, businessId, userId, GRANTS, {
        saleId: sale.id,
        items: [{ saleItemId: line.id, qty: 20 }],
        reason: 'Too many',
      }),
      'RETURN_QTY_EXCEEDED'
    );

    const history = await listSaleReturns(local, businessId, {});
    expect(history.items).toHaveLength(1);
    expect(firstRow(history.items).kind).toBe('refund');
  });

  it('moves stock between branches and refuses bad transfers', async () => {
    const branch = await createLocation(local, businessId, userId, GRANTS, {
      name: 'Branch Two',
      state: 'Lagos',
      lga: 'Ikeja',
    });

    const { reference } = await createStockTransfer(local, businessId, userId, GRANTS, {
      fromLocationId: locationId,
      toLocationId: branch.id,
      items: [{ productId: plainProductId, qty: 10 }],
    });
    expect(reference).toMatch(/TRF|TR/i);
    expect(onHand(plainProductId, locationId)).toBe(40);
    expect(onHand(plainProductId, branch.id)).toBe(10);

    await expectCode(
      createStockTransfer(local, businessId, userId, GRANTS, {
        fromLocationId: locationId,
        toLocationId: locationId,
        items: [{ productId: plainProductId, qty: 1 }],
      }),
      'TRANSFER_SAME_LOCATION'
    );
    await expectCode(
      createStockTransfer(local, businessId, userId, GRANTS, {
        fromLocationId: locationId,
        toLocationId: branch.id,
        items: [{ productId: plainProductId, qty: 999 }],
      }),
      'NEGATIVE_STOCK'
    );

    const { items } = await listStockTransfers(local, businessId, {});
    expect(items).toHaveLength(1);
    expect(firstRow(firstRow(items).items).qty).toBe(10);
  });

  it('lists debtors and previews WhatsApp reminders when WhatsApp is off', async () => {
    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Owing Obi',
      phone: '08031234567',
      creditLimitKobo: 200000,
    });
    await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId: plainProductId, qty: 5 }],
      customerId,
      payments: [{ method: 'credit', amountKobo: 10000 }],
    });

    const { items, totalKobo } = await listDebtors(local, businessId);
    expect(items).toHaveLength(1);
    expect(firstRow(items).name).toBe('Owing Obi');
    expect(totalKobo).toBe(10000);

    const result = await sendDebtorReminders(local, businessId, userId, GRANTS, {
      dryRun: true,
    });
    expect(result.attempted).toBe(1);
    expect(result.dryRun).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('encrypts a backup, uploads it and decrypts with the passphrase', async () => {
    const backupsDir = mkdtempSync(join(tmpdir(), 'analytiq-cloud-'));
    const passphrase = 'correct horse battery staple';
    setCloudBackupSettings(local, businessId, userId, GRANTS, {
      enabled: true,
      url: 'https://uploads.example.test/put',
      key: 'secret-key',
      passphrase,
      keepLocal: true,
    });

    let uploadedFile = '';
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      uploadedFile = String((init?.headers as Record<string, string>)['x-analytiq-file'] ?? '');
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await runEncryptedCloudBackup(local, businessId, userId, GRANTS, backupsDir, {
      fetchImpl: fakeFetch,
    });
    expect(result.uploaded).toBe(true);
    expect(result.fileName.endsWith('.aqb')).toBe(true);
    expect(uploadedFile).toBe(result.fileName);

    const container = readFileSync(join(backupsDir, result.fileName));
    const plain = decryptBuffer(container, passphrase);
    expect(plain.subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
    expect(() => decryptBuffer(container, 'wrong-passphrase')).toThrow();
  });

  it('installs modules from the business type preset and applies overrides', async () => {
    const base = await getModuleInstallView(local, businessId);
    expect(base.businessType).toBe('pharmacy');
    expect(base.modules).toContain('expiry');
    expect(base.modules).not.toContain('tables');

    const updated = await setModuleInstall(local, businessId, userId, GRANTS, {
      overrides: { tables: true, expiry: false },
    });
    expect(updated.modules).toContain('tables');
    expect(updated.modules).not.toContain('expiry');

    const session = await login(local, { email: 'ada@batch15.ng', password: 'Admin1234' });
    const me = await authenticate(local, session.token);
    expect(me?.modules).toContain('tables');
    expect(me?.modules).not.toContain('expiry');
  });
});
