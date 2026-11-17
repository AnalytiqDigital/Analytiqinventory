import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import {
  archiveCustomer,
  createCustomer,
  getCustomer,
  listCustomerPayments,
  listCustomers,
  recordCustomerPayment,
  updateCustomer,
} from './customers';
import { createProduct, getProduct } from './inventory';
import { runMigrations } from './migrate';
import { createPurchase, listPurchases, receivePurchase } from './purchases';
import { createSale, listSales } from './sales';
import { runSetup } from './service';
import { archiveSupplier, createSupplier, listSuppliers } from './suppliers';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.view',
  'customers.manage',
  'suppliers.manage',
  'purchases.manage',
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

/** 45000 + 7.5% VAT = 48375. */
const SALE_TOTAL = 48375;

describe('batch 6 customers, suppliers and purchasing', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch6-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
    ({ id: productId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Indomie 70g',
      sku: 'IND-70',
      sellingPriceKobo: 45000,
      costPriceKobo: 32000,
      openingStock: 20,
    }));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  describe('customers', () => {
    it('creates, lists and reads back a customer', async () => {
      const { id } = await createCustomer(local, businessId, userId, GRANTS, {
        name: 'Ada Obi',
        phone: '08030000000',
        creditLimitKobo: 500000,
      });
      const view = await getCustomer(local, businessId, id);
      expect(view?.name).toBe('Ada Obi');
      expect(view?.balanceKobo).toBe(0);

      const listed = await listCustomers(local, businessId, { search: 'Ada' });
      expect(listed.total).toBe(1);
      expect(listed.items[0]?.id).toBe(id);
    });

    it('rejects an invalid email and phone', async () => {
      await expect(
        createCustomer(local, businessId, userId, GRANTS, { name: 'Bad Email', email: 'nope' })
      ).rejects.toThrow();
      await expect(
        createCustomer(local, businessId, userId, GRANTS, { name: 'Bad Phone', phone: 'abc' })
      ).rejects.toThrow();
    });

    it('requires customers.manage', async () => {
      await expect(
        createCustomer(local, businessId, userId, ['sales.create'], { name: 'Nope' })
      ).rejects.toThrow();
    });

    it('archives a customer with no balance and restores it', async () => {
      const { id } = await createCustomer(local, businessId, userId, GRANTS, { name: 'Chidi' });
      await archiveCustomer(local, businessId, userId, GRANTS, id);
      expect((await getCustomer(local, businessId, id))?.isActive).toBe(false);
      // Hidden from the default list, visible with includeInactive.
      expect((await listCustomers(local, businessId, {})).total).toBe(0);
      expect((await listCustomers(local, businessId, { includeInactive: true })).total).toBe(1);

      await updateCustomer(local, businessId, userId, GRANTS, id, { isActive: true });
      expect((await listCustomers(local, businessId, {})).total).toBe(1);
    });
  });

  describe('credit sales', () => {
    async function newCustomer(creditLimitKobo = 0): Promise<string> {
      const { id } = await createCustomer(local, businessId, userId, GRANTS, {
        name: `Customer ${creditLimitKobo}`,
        creditLimitKobo,
      });
      return id;
    }

    it('puts an unpaid sale on the customer account', async () => {
      const customerId = await newCustomer();
      await createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
      });

      const view = await getCustomer(local, businessId, customerId);
      expect(view?.balanceKobo).toBe(SALE_TOTAL);

      const sale = (await listSales(local, businessId, GRANTS, {})).items[0];
      expect(sale?.customerName).toBe('Customer 0');

      // Archiving is refused while money is owed.
      await expect(archiveCustomer(local, businessId, userId, GRANTS, customerId)).rejects.toThrow(
        /still owes/i
      );
    });

    it('refuses a credit payment with no customer', async () => {
      await expect(
        createSale(local, businessId, userId, GRANTS, {
          items: [{ productId, qty: 1 }],
          payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
        })
      ).rejects.toThrow(/customer/i);
    });

    it('enforces the credit limit', async () => {
      const customerId = await newCustomer(10000);
      await expect(
        createSale(local, businessId, userId, GRANTS, {
          items: [{ productId, qty: 1 }],
          customerId,
          payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
        })
      ).rejects.toThrow(/limit/i);
    });

    it('refuses a credit sale with change owing', async () => {
      const customerId = await newCustomer();
      await expect(
        createSale(local, businessId, userId, GRANTS, {
          items: [{ productId, qty: 1 }],
          customerId,
          payments: [{ method: 'credit', amountKobo: SALE_TOTAL + 500 }],
        })
      ).rejects.toThrow();
    });

    it('settles the balance with a customer payment', async () => {
      const customerId = await newCustomer();
      await createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
      });

      const res = await recordCustomerPayment(local, businessId, userId, GRANTS, {
        customerId,
        amountKobo: 20000,
        method: 'cash',
      });
      expect(res.balanceKobo).toBe(SALE_TOTAL - 20000);

      const payments = await listCustomerPayments(local, businessId, customerId);
      expect(payments).toHaveLength(1);
      expect(payments[0]?.amountKobo).toBe(20000);

      // Paying the rest clears the balance, so archiving is allowed again.
      await recordCustomerPayment(local, businessId, userId, GRANTS, {
        customerId,
        amountKobo: SALE_TOTAL - 20000,
        method: 'transfer',
      });
      expect((await getCustomer(local, businessId, customerId))?.balanceKobo).toBe(0);
      await archiveCustomer(local, businessId, userId, GRANTS, customerId);
      expect((await getCustomer(local, businessId, customerId))?.isActive).toBe(false);
    });

    it('does not count cash paid by a named customer as debt', async () => {
      const customerId = await newCustomer();
      await createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'cash', amountKobo: SALE_TOTAL }],
      });

      expect((await getCustomer(local, businessId, customerId))?.balanceKobo).toBe(0);
      expect((await listCustomers(local, businessId, {})).outstandingKobo).toBe(0);
    });

    it('puts only the credit portion of a split tender on the account', async () => {
      // The limit (40,000) is above the credit part (38,375) but below the sale
      // total, so this also proves the limit checks the credit tender only.
      const customerId = await newCustomer(40000);
      await createSale(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [
          { method: 'cash', amountKobo: 10000 },
          { method: 'credit', amountKobo: SALE_TOTAL - 10000 },
        ],
      });

      const view = await getCustomer(local, businessId, customerId);
      expect(view?.balanceKobo).toBe(SALE_TOTAL - 10000);
      expect((await listCustomers(local, businessId, {})).outstandingKobo).toBe(SALE_TOTAL - 10000);
    });
  });

  describe('suppliers', () => {
    it('creates, searches and archives a supplier', async () => {
      const { id } = await createSupplier(local, businessId, userId, GRANTS, {
        name: 'Lagos Wholesale',
        contactName: 'Bola',
        phone: '08012345678',
      });
      const listed = await listSuppliers(local, businessId, { search: 'Wholesale' });
      expect(listed.total).toBe(1);
      expect(listed.items[0]?.contactName).toBe('Bola');

      await archiveSupplier(local, businessId, userId, GRANTS, id);
      expect((await listSuppliers(local, businessId, {})).total).toBe(0);
    });
  });

  describe('purchases', () => {
    it('requires at least one item', async () => {
      await expect(
        createPurchase(local, businessId, userId, GRANTS, { items: [] })
      ).rejects.toThrow();
    });

    it('receives stock into inventory once', async () => {
      const before = (await getProduct(local, businessId, productId))?.onHand ?? 0;
      const { id, reference } = await createPurchase(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 10, unitCostKobo: 30000 }],
        amountPaidKobo: 300000,
      });
      expect(reference).toMatch(/^PUR-/);

      const res = await receivePurchase(local, businessId, userId, GRANTS, id);
      expect(res.stockLines).toBe(1);
      expect((await getProduct(local, businessId, productId))?.onHand).toBe(before + 10);

      // Receiving twice is refused, so stock cannot be double-counted.
      await expect(receivePurchase(local, businessId, userId, GRANTS, id)).rejects.toThrow();

      const listed = await listPurchases(local, businessId, { status: 'received' });
      expect(listed.total).toBe(1);
      expect(listed.items[0]?.items[0]?.qty).toBe(10);
    });

    it('leaves stock untouched until the purchase is received', async () => {
      const before = (await getProduct(local, businessId, productId))?.onHand ?? 0;
      await createPurchase(local, businessId, userId, GRANTS, {
        items: [{ productId, qty: 5, unitCostKobo: 25000 }],
      });
      expect((await getProduct(local, businessId, productId))?.onHand).toBe(before);
      expect((await listPurchases(local, businessId, { status: 'draft' })).total).toBe(1);
    });
  });

  describe('Batch 6 permission backfill', () => {
    it('grants the new permissions to existing system roles', async () => {
      const keys = ['purchases.manage', 'customers.manage', 'suppliers.manage'];
      const placeholders = keys.map(() => '?').join(', ');

      // Simulate an installation created before Batch 6: the new keys and their
      // grants are absent, and migration 0007 has not run yet.
      local.raw
        .prepare(`DELETE FROM role_permissions WHERE permission_key IN (${placeholders})`)
        .run(...keys);
      local.raw.prepare(`DELETE FROM permissions WHERE key IN (${placeholders})`).run(...keys);
      local.raw
        .prepare('DELETE FROM __migrations WHERE name = ?')
        .run('0007_backfill_batch6_permissions.sql');

      runMigrations(join(dir, 'local.db'));

      const perms = local.raw
        .prepare(`SELECT key FROM permissions WHERE key IN (${placeholders}) ORDER BY key`)
        .all(...keys) as Array<{ key: string }>;
      expect(perms).toHaveLength(3);

      const grants = local.raw
        .prepare(
          `SELECT r.name AS role, rp.permission_key AS key
           FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           WHERE rp.permission_key IN (${placeholders})
           ORDER BY r.name, rp.permission_key`
        )
        .all(...keys) as Array<{ role: string; key: string }>;
      expect(grants).toHaveLength(6);
      expect(new Set(grants.map((g) => g.role))).toEqual(new Set(['Administrator', 'Manager']));

      const cashier = local.raw
        .prepare(
          `SELECT COUNT(*) AS n
           FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           WHERE r.name = 'Cashier' AND rp.permission_key IN (${placeholders})`
        )
        .get(...keys) as { n: number };
      expect(cashier.n).toBe(0);
    });
  });
});
