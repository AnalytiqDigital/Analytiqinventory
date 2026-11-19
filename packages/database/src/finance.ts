// Batch 14: expenses ledger for the profit statement.

import { expenseCreateSchema, expenseQuerySchema } from '@analytiq/validation';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { expenses, locations, users } from './schema';

export interface ExpenseView {
  id: string;
  category: string;
  note: string;
  amountKobo: number;
  paidAt: string;
  locationId: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function toView(row: {
  id: string;
  category: string;
  note: string;
  amountKobo: number;
  paidAt: Date;
  locationId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
}): ExpenseView {
  return {
    id: row.id,
    category: row.category,
    note: row.note,
    amountKobo: row.amountKobo,
    paidAt: row.paidAt.toISOString(),
    locationId: row.locationId ?? null,
    createdBy: row.createdBy ?? null,
    createdByName: row.createdByName ?? '',
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listExpenses(
  local: LocalDb,
  businessId: string,
  grants: string[],
  raw: unknown
): Promise<{ items: ExpenseView[]; totalKobo: number }> {
  requirePermission(new Set(grants), 'finance.manage');
  const query = expenseQuerySchema.parse(raw ?? {});

  const filters = [eq(expenses.businessId, businessId)];
  if (query.from) filters.push(gte(expenses.paidAt, query.from));
  if (query.to) filters.push(lte(expenses.paidAt, query.to));
  if (query.locationId) filters.push(eq(expenses.locationId, query.locationId));

  const rows = await local.db
    .select({
      id: expenses.id,
      category: expenses.category,
      note: expenses.note,
      amountKobo: expenses.amountKobo,
      paidAt: expenses.paidAt,
      locationId: expenses.locationId,
      createdBy: expenses.createdBy,
      createdByName: users.name,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .leftJoin(users, eq(users.id, expenses.createdBy))
    .where(and(...filters))
    .orderBy(desc(expenses.paidAt), desc(expenses.createdAt))
    .limit(query.limit);

  const items = rows.map(toView);
  return {
    items,
    totalKobo: items.reduce((sum, e) => sum + e.amountKobo, 0),
  };
}

export async function createExpense(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  raw: unknown
): Promise<{ expense: ExpenseView }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = expenseCreateSchema.parse(raw);

  let locationId: string | null = input.locationId ?? null;
  if (locationId) {
    const [location] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, businessId)))
      .limit(1);
    if (!location) throw codedError('Location not found', 'LOCATION_NOT_FOUND');
  } else {
    const [first] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.businessId, businessId))
      .limit(1);
    locationId = first?.id ?? null;
  }

  const id = newId('exp');
  const now = new Date();
  const paidAt = input.paidAt ?? now;

  const write = local.raw.transaction(() => {
    local.db
      .insert(expenses)
      .values({
        id,
        businessId,
        locationId,
        category: input.category,
        note: input.note,
        amountKobo: input.amountKobo,
        paidAt,
        createdBy: actorId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'expense.create',
      entity: 'expense',
      entityId: id,
      details: { category: input.category, amountKobo: input.amountKobo },
    });
  });
  write();

  const rows = await local.db
    .select({
      id: expenses.id,
      category: expenses.category,
      note: expenses.note,
      amountKobo: expenses.amountKobo,
      paidAt: expenses.paidAt,
      locationId: expenses.locationId,
      createdBy: expenses.createdBy,
      createdByName: users.name,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .leftJoin(users, eq(users.id, expenses.createdBy))
    .where(eq(expenses.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw codedError('Expense not found after save', 'EXPENSE_NOT_FOUND');
  return { expense: toView(row) };
}

export async function deleteExpense(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  expenseId: string
): Promise<{ ok: true }> {
  requirePermission(new Set(grants), 'finance.manage');
  const [existing] = await local.db
    .select({ id: expenses.id, category: expenses.category, amountKobo: expenses.amountKobo })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Expense not found', 'EXPENSE_NOT_FOUND');

  const write = local.raw.transaction(() => {
    local.db.delete(expenses).where(eq(expenses.id, expenseId)).run();
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'expense.delete',
      entity: 'expense',
      entityId: expenseId,
      details: { category: existing.category, amountKobo: existing.amountKobo },
    });
  });
  write();

  return { ok: true };
}
