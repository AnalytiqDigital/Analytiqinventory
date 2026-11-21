import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adjustAccount,
  createAccount,
  getPaymentMap,
  listAccounts,
  listAccountTransactions,
  setPaymentMap,
  transferBetweenAccounts,
  updateAccount,
} from './accounts';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createCustomer, recordCustomerPayment } from './customers';
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from './finance';
import { createProduct } from './inventory';
import { runMigrations } from './migrate';
import { refundSale, createSale, getSale, voidSale } from './sales';
import { runSetup } from './service';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.refund',
  'sales.view',
  'settings.manage',
  'finance.manage',
  'customers.manage',
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
      taxRateBps: 0,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@testmart.ng', password: 'Admin1234' },
  };
}

describe('cash & bank accounts', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-accounts-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
    ({ id: productId } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Bread',
      sellingPriceKobo: 10000,
      openingStock: 100,
    }));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  async function sell(payments: Array<{ method: 'cash' | 'transfer' | 'pos' | 'credit'; amountKobo: number }>, extra: Record<string, unknown> = {}) {
    return createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 1 }],
      payments,
      ...extra,
    });
  }

  async function balanceOf(kind: 'cash' | 'bank' | 'pos'): Promise<number> {
    const { items } = await listAccounts(local, businessId, GRANTS);
    return items.find((a) => a.kind === kind)?.balanceKobo ?? 0;
  }

  it('starts with one cash account and keeps one default', async () => {
    const first = await listAccounts(local, businessId, GRANTS);
    expect(first.items).toHaveLength(0);

    const { account: cash } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Main Drawer',
      kind: 'cash',
      openingBalanceKobo: 50000,
    });
    expect(cash.isDefault).toBe(true);
    expect(cash.balanceKobo).toBe(50000);

    const { account: bank } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'GTBank',
      kind: 'bank',
    });
    expect(bank.isDefault).toBe(false);

    const { account: promoted } = await updateAccount(
      local,
      businessId,
      userId,
      GRANTS,
      bank.id,
      { isDefault: true, openingBalanceKobo: 200000 }
    );
    expect(promoted.isDefault).toBe(true);
    const all = await listAccounts(local, businessId, GRANTS);
    expect(all.items.filter((a) => a.isDefault).map((a) => a.name)).toEqual(['GTBank']);
    expect(all.totalKobo).toBe(250000);

    await expect(
      createAccount(local, businessId, userId, GRANTS, { name: 'Main Drawer', kind: 'bank' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
    await expect(
      updateAccount(local, businessId, userId, GRANTS, bank.id, { archived: true })
    ).rejects.toMatchObject({ code: 'ACCOUNT_IS_DEFAULT' });
  });

  it('posts sale money net of change and returns it on refund and void', async () => {
    await sell([{ method: 'cash', amountKobo: 50000 }]);
    expect(await balanceOf('cash')).toBe(10000);

    const second = await sell([{ method: 'cash', amountKobo: 10000 }]);
    expect(await balanceOf('cash')).toBe(20000);

    await refundSale(local, businessId, userId, GRANTS, second.id, { reason: 'Wrong item' });
    expect(await balanceOf('cash')).toBe(10000);

    const third = await sell([{ method: 'cash', amountKobo: 10000 }]);
    await voidSale(local, businessId, userId, GRANTS, third.id, { reason: 'Till test' });
    expect(await balanceOf('cash')).toBe(10000);

    const ledger = await listAccountTransactions(local, businessId, GRANTS, {});
    expect(ledger.items.some((t) => t.kind === 'sale')).toBe(true);
    expect(ledger.items.some((t) => t.kind === 'refund')).toBe(true);
    expect(ledger.items.some((t) => t.kind === 'sale_void')).toBe(true);
  });

  it('routes each tender to the account mapped for it', async () => {
    const { account: cash } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Drawer',
      kind: 'cash',
    });
    const { account: bank } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Bank',
      kind: 'bank',
    });
    const { account: terminal } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Moniepoint',
      kind: 'pos',
    });
    await setPaymentMap(local, businessId, userId, GRANTS, {
      cash: cash.id,
      transfer: bank.id,
      pos: terminal.id,
    });
    expect(getPaymentMap(local, businessId)).toMatchObject({
      cash: cash.id,
      transfer: bank.id,
      pos: terminal.id,
    });

    await sell([
      { method: 'cash', amountKobo: 4000 },
      { method: 'transfer', amountKobo: 3000 },
      { method: 'pos', amountKobo: 3000 },
    ]);
    expect(cash.balanceKobo).toBe(0);
    const all = await listAccounts(local, businessId, GRANTS);
    expect(all.items.find((a) => a.id === cash.id)?.balanceKobo).toBe(4000);
    expect(all.items.find((a) => a.id === bank.id)?.balanceKobo).toBe(3000);
    expect(all.items.find((a) => a.id === terminal.id)?.balanceKobo).toBe(3000);
  });

  it('records expenses, edits and deletions against the right account', async () => {
    const { account: bank } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Bank',
      kind: 'bank',
      openingBalanceKobo: 100000,
    });
    const { expense } = await createExpense(local, businessId, userId, GRANTS, {
      category: 'Utilities',
      amountKobo: 20000,
      accountId: bank.id,
    });
    expect(expense.accountId).toBe(bank.id);
    expect((await listAccounts(local, businessId, GRANTS)).items[0]?.balanceKobo).toBe(80000);

    await updateExpense(local, businessId, userId, GRANTS, expense.id, { amountKobo: 15000 });
    expect((await listAccounts(local, businessId, GRANTS)).items[0]?.balanceKobo).toBe(85000);

    const { account: cash } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Drawer',
      kind: 'cash',
      openingBalanceKobo: 50000,
    });
    await updateExpense(local, businessId, userId, GRANTS, expense.id, { accountId: cash.id });
    const afterMove = await listAccounts(local, businessId, GRANTS);
    expect(afterMove.items.find((a) => a.id === bank.id)?.balanceKobo).toBe(100000);
    expect(afterMove.items.find((a) => a.id === cash.id)?.balanceKobo).toBe(35000);

    await deleteExpense(local, businessId, userId, GRANTS, expense.id);
    expect(await listAccounts(local, businessId, GRANTS)).toMatchObject({ totalKobo: 150000 });
    expect((await listExpenses(local, businessId, GRANTS, {})).items).toHaveLength(0);
    const ledger = await listAccountTransactions(local, businessId, GRANTS, {});
    expect(ledger.items.filter((t) => t.source === 'expense').length).toBeGreaterThan(0);
  });

  it('credits the chosen account when a debtor pays', async () => {
    const { account: bank } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Bank',
      kind: 'bank',
    });
    const { id: customerId } = await createCustomer(local, businessId, userId, GRANTS, {
      name: 'Chidi Okeke',
      phone: '08012345678',
    });
    await recordCustomerPayment(local, businessId, userId, GRANTS, {
      customerId,
      amountKobo: 25000,
      method: 'transfer',
      accountId: bank.id,
    });
    expect(await balanceOf('bank')).toBe(25000);
  });

  it('moves money between accounts and blocks overdrafts', async () => {
    const { account: bank } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Bank',
      kind: 'bank',
      openingBalanceKobo: 100000,
    });
    const { account: cash } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'Drawer',
      kind: 'cash',
    });

    await transferBetweenAccounts(local, businessId, userId, GRANTS, {
      fromAccountId: bank.id,
      toAccountId: cash.id,
      amountKobo: 40000,
      note: 'Teller withdrawal',
    });
    const after = await listAccounts(local, businessId, GRANTS);
    expect(after.items.find((a) => a.id === bank.id)?.balanceKobo).toBe(60000);
    expect(after.items.find((a) => a.id === cash.id)?.balanceKobo).toBe(40000);

    await expect(
      transferBetweenAccounts(local, businessId, userId, GRANTS, {
        fromAccountId: bank.id,
        toAccountId: cash.id,
        amountKobo: 90000,
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_INSUFFICIENT' });

    await expect(
      adjustAccount(local, businessId, userId, GRANTS, {
        accountId: cash.id,
        amountKobo: -50000,
        note: 'Cash count short',
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_INSUFFICIENT' });

    await adjustAccount(local, businessId, userId, GRANTS, {
      accountId: cash.id,
      amountKobo: 2500,
      note: 'Opening float top-up',
    });
    expect(await balanceOf('cash')).toBe(42500);
  });

  it('stores service charge, tip, order type and waiter on the sale', async () => {
    const sale = await sell(
      [{ method: 'cash', amountKobo: 20000 }],
      {
        orderType: 'dine_in',
        waiterName: 'Tunde',
        serviceChargeKobo: 750,
        tipKobo: 500,
      }
    );
    expect(sale.totalKobo).toBe(11250);
    const detail = await getSale(local, businessId, GRANTS, sale.id);
    expect(detail.orderType).toBe('dine_in');
    expect(detail.waiterName).toBe('Tunde');
    expect(detail.serviceChargeKobo).toBe(750);
    expect(detail.tipKobo).toBe(500);
    expect(await balanceOf('cash')).toBe(11250);
  });

  it('decides the account from the tender when no map is set', async () => {
    const { account: terminal } = await createAccount(local, businessId, userId, GRANTS, {
      name: 'POS Terminal',
      kind: 'pos',
    });
    await sell([{ method: 'pos', amountKobo: 10000 }]);
    const all = await listAccounts(local, businessId, GRANTS);
    expect(all.items.find((a) => a.id === terminal.id)?.balanceKobo).toBe(10000);
    expect(all.items.find((a) => a.kind === 'cash')?.balanceKobo ?? 0).toBe(0);
  });
});
