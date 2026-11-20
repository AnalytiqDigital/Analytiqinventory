import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './finance';
import { createProduct } from './inventory';
import { runMigrations } from './migrate';
import { getReportsSummary } from './reports';
import { createSale } from './sales';
import { login, runSetup } from './service';
import {
  createStaff,
  listRoles,
  listStaff,
  resetStaffPassword,
  updateRolePermissions,
  updateStaff,
} from './staff';

const GRANTS = [
  'products.manage',
  'inventory.adjust',
  'inventory.view',
  'sales.create',
  'sales.view',
  'customers.manage',
  'reports.view',
  'finance.manage',
  'staff.manage',
];

function setupInput() {
  return {
    business: {
      name: 'Batch Fourteen Stores',
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@batch14.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@batch14.ng', password: 'Admin1234' },
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

describe('batch 14 staff and finance', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;
  let productId: string;
  let cashierRoleId: string;
  let adminRoleId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-batch14-'));
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
    const { items: roles } = await listRoles(local, businessId, GRANTS);
    cashierRoleId = roles.find((r) => r.name === 'Cashier')?.id ?? '';
    adminRoleId = roles.find((r) => r.name === 'Administrator')?.id ?? '';
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  it('lists the three seeded roles with their grants', async () => {
    const { items: roles } = await listRoles(local, businessId, GRANTS);
    expect(roles.map((r) => r.name).sort()).toEqual(['Administrator', 'Cashier', 'Manager']);
    const admin = roles.find((r) => r.name === 'Administrator');
    expect(admin?.isSystem).toBe(true);
    expect(admin?.permissions).toContain('staff.manage');
    expect(admin?.userCount).toBe(1);
  });

  it('creates a staff account that can sign in, and rejects duplicate email', async () => {
    const { staff } = await createStaff(local, businessId, userId, GRANTS, {
      name: 'Chidi Cashier',
      email: 'Chidi@Batch14.ng',
      password: 'Cashier123',
      roleId: cashierRoleId,
    });
    expect(staff.email).toBe('chidi@batch14.ng');
    expect(staff.roleName).toBe('Cashier');
    expect(staff.isActive).toBe(true);

    const session = await login(local, { email: 'chidi@batch14.ng', password: 'Cashier123' });
    expect(session.user.permissions).toContain('sales.create');
    expect(session.user.permissions).not.toContain('staff.manage');

    await expectCode(
      createStaff(local, businessId, userId, GRANTS, {
        name: 'Copy Cat',
        email: 'chidi@batch14.ng',
        password: 'Cashier123',
        roleId: cashierRoleId,
      }),
      'EMAIL_TAKEN'
    );

    const { items } = await listStaff(local, businessId, GRANTS);
    expect(items).toHaveLength(2);
  });

  it('resets a password and revokes old sessions', async () => {
    const { staff } = await createStaff(local, businessId, userId, GRANTS, {
      name: 'Chidi Cashier',
      email: 'chidi@batch14.ng',
      password: 'Cashier123',
      roleId: cashierRoleId,
    });
    const first = await login(local, { email: 'chidi@batch14.ng', password: 'Cashier123' });

    await resetStaffPassword(local, businessId, userId, GRANTS, staff.id, {
      password: 'Freshpass99',
    });
    await expect(
      login(local, { email: 'chidi@batch14.ng', password: 'Cashier123' })
    ).rejects.toThrow(/Invalid email or password/);
    const second = await login(local, { email: 'chidi@batch14.ng', password: 'Freshpass99' });
    expect(second.token).not.toBe(first.token);
  });

  it('guards self-deactivation and lock-out from the last staff manager', async () => {
    await expectCode(
      updateStaff(local, businessId, userId, GRANTS, userId, { isActive: false }),
      'CANNOT_DEACTIVATE_SELF'
    );
    await expectCode(
      updateStaff(local, businessId, userId, GRANTS, userId, { roleId: cashierRoleId }),
      'CANNOT_CHANGE_OWN_ROLE'
    );
  });

  it('edits role permissions, keeps Administrator locked, and applies grants live', async () => {
    const { role: cashier } = await updateRolePermissions(
      local,
      businessId,
      userId,
      GRANTS,
      cashierRoleId,
      { permissions: ['sales.view', 'inventory.view'] }
    );
    expect(cashier.permissions).toEqual(['inventory.view', 'sales.view']);

    await createStaff(local, businessId, userId, GRANTS, {
      name: 'No Sell Cashier',
      email: 'nosell@batch14.ng',
      password: 'Cashier123',
      roleId: cashierRoleId,
    });
    const session = await login(local, { email: 'nosell@batch14.ng', password: 'Cashier123' });
    await expectCode(
      createSale(local, businessId, session.user.id, session.user.permissions, {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'cash', amountKobo: 100_000 }],
      }),
      'FORBIDDEN'
    );

    const { role: admin } = await updateRolePermissions(
      local,
      businessId,
      userId,
      GRANTS,
      adminRoleId,
      {
        permissions: ['reports.view'],
      }
    );
    expect(admin.permissions).toContain('staff.manage');
    expect(admin.permissions).toContain('settings.manage');
  });

  it('records expenses and folds them into the profit statement', async () => {
    const paidAt = new Date();
    const { expense } = await createExpense(local, businessId, userId, GRANTS, {
      category: 'Rent',
      note: 'November shop rent',
      amountKobo: 500_000,
      paidAt,
    });
    expect(expense.category).toBe('Rent');
    expect(expense.createdByName).toBe('Ada Admin');

    await createExpense(local, businessId, userId, GRANTS, {
      category: 'Transport',
      amountKobo: 20_000,
    });

    const { items, totalKobo } = await listExpenses(local, businessId, GRANTS, {});
    expect(items).toHaveLength(2);
    expect(totalKobo).toBe(520_000);

    await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 100_000 }],
    });

    const summary = getReportsSummary(local, businessId, GRANTS, {});
    expect(summary.sales.grossKobo).toBe(96_750);
    expect(summary.sales.cogsKobo).toBe(64_000);
    expect(summary.sales.grossProfitKobo).toBe(26_000);
    expect(summary.expenses.totalKobo).toBe(520_000);
    expect(summary.expenses.count).toBe(2);
    expect(summary.expenses.byCategory.map((c) => c.category)).toEqual(['Rent', 'Transport']);
    expect(summary.finance.expensesKobo).toBe(520_000);
    expect(summary.finance.netProfitKobo).toBe(-494_000);

    const thisWeek = summary.weekly.find(
      (w) => w.grossKobo === 96_750 && w.expensesKobo === 520_000
    );
    expect(thisWeek).toBeDefined();
    expect(thisWeek?.netProfitKobo).toBe(-494_000);
    expect(thisWeek?.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await deleteExpense(local, businessId, userId, GRANTS, expense.id);
    const after = await listExpenses(local, businessId, GRANTS, {});
    expect(after.items).toHaveLength(1);
    expect(after.totalKobo).toBe(20_000);
  });

  it('edits an expense and refuses edits without finance.manage', async () => {
    const { expense } = await createExpense(local, businessId, userId, GRANTS, {
      category: 'Rent',
      note: 'Shop rent',
      amountKobo: 500_000,
    });

    const { expense: updated } = await updateExpense(
      local,
      businessId,
      userId,
      GRANTS,
      expense.id,
      {
        amountKobo: 175_000,
        note: 'Corrected rent',
      }
    );
    expect(updated).toMatchObject({
      category: 'Rent',
      note: 'Corrected rent',
      amountKobo: 175_000,
    });

    const listed = await listExpenses(local, businessId, GRANTS, {});
    expect(listed.totalKobo).toBe(175_000);

    await expectCode(
      updateExpense(local, businessId, userId, ['reports.view'], expense.id, {
        amountKobo: 1,
      }),
      'FORBIDDEN'
    );
    await expectCode(
      updateExpense(local, businessId, userId, GRANTS, 'missing-expense', { amountKobo: 1 }),
      'EXPENSE_NOT_FOUND'
    );
  });

  it('reports every product and flags low stock with order suggestions', async () => {
    await createProduct(local, businessId, userId, GRANTS, {
      name: 'Never Sold Water',
      sku: 'WAT-50',
      sellingPriceKobo: 20000,
      costPriceKobo: 12000,
      openingStock: 2,
      reorderLevel: 5,
    });
    await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 100_000 }],
    });

    const summary = getReportsSummary(local, businessId, GRANTS, {});
    expect(summary.products).toHaveLength(2);
    expect(summary.products[0]).toMatchObject({ productId, qty: 2, onHand: 98 });
    const unsold = summary.products.find((p) => p.sku === 'WAT-50');
    expect(unsold).toMatchObject({ qty: 0, onHand: 2, reorderLevel: 5 });

    expect(summary.stockAlerts).toHaveLength(1);
    expect(summary.stockAlerts[0]).toMatchObject({
      sku: 'WAT-50',
      onHand: 2,
      reorderLevel: 5,
      shortfall: 3,
      suggestedOrder: 8,
    });
  });

  it('denies expense writes without finance.manage', async () => {
    await expectCode(
      createExpense(local, businessId, userId, ['reports.view'], {
        category: 'Rent',
        amountKobo: 100_000,
      }),
      'FORBIDDEN'
    );
    await expectCode(listExpenses(local, businessId, ['reports.view'], {}), 'FORBIDDEN');
  });
});
