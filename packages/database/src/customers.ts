// Batch 6: customers + the credit ledger.
//
// RULES:
// - A customer is optional on a sale. Walk-in sales keep customer_id NULL.
// - A customer's balance is DERIVED, never stored:
//     owed = sum(credit tenders) - sum(payments)
//   so it can never drift from the underlying rows. Cash/transfer tenders on a
//   sale that names a customer are NOT debt.
// - Credit limit is enforced at sale time (see sales.ts), not here.
// - Customers are archived (is_active = 0), never deleted, so historical
//   sales keep their reference.

import {
  customerPaymentSchema,
  customerSchema,
  customerUpdateSchema,
  customersQuerySchema,
} from '@analytiq/validation';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { postCustomerPaymentSync } from './accounts';
import { customerGroups, customerPayments, customers, priceTiers, sales } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface CustomerView {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  creditLimitKobo: number;
  priceTierId: string | null;
  priceTierName: string | null;
  groupId: string | null;
  groupName: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  /** Outstanding credit: credit tenders minus payments. */
  balanceKobo: number;
  createdAt: string;
}

/** Outstanding balance for one customer: only credit tenders are debt. */
function balanceOf(local: LocalDb, businessId: string, customerId: string): number {
  const owed = local.raw
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_kobo), 0) AS v
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.business_id = ? AND s.customer_id = ? AND s.status = 'completed'
      AND sp.method = 'credit'`
    )
    .get(businessId, customerId) as { v: number } | undefined;
  const paid = local.raw
    .prepare(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS v FROM customer_payments
    WHERE business_id = ? AND customer_id = ?`
    )
    .get(businessId, customerId) as { v: number } | undefined;
  return (owed?.v ?? 0) - (paid?.v ?? 0);
}

function toView(
  row: typeof customers.$inferSelect,
  balanceKobo: number,
  tierName: string | null = null,
  loyaltyPoints = 0,
  groupName: string | null = null
): CustomerView {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    note: row.note,
    creditLimitKobo: row.creditLimitKobo,
    priceTierId: row.priceTierId ?? null,
    priceTierName: tierName,
    groupId: row.groupId ?? null,
    groupName,
    loyaltyPoints,
    isActive: row.isActive === 1,
    balanceKobo,
    createdAt: row.createdAt.toISOString(),
  };
}

function tierNames(local: LocalDb, businessId: string): Map<string, string> {
  const rows = local.raw
    .prepare('SELECT id, name FROM price_tiers WHERE business_id = ?')
    .all(businessId) as Array<{ id: string; name: string }>;
  return new Map(rows.map((r) => [r.id, r.name]));
}

function groupNames(local: LocalDb, businessId: string): Map<string, string> {
  const rows = local.raw
    .prepare('SELECT id, name FROM customer_groups WHERE business_id = ?')
    .all(businessId) as Array<{ id: string; name: string }>;
  return new Map(rows.map((r) => [r.id, r.name]));
}

function pointsMap(local: LocalDb, businessId: string, customerIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (customerIds.length === 0) return map;
  const placeholders = customerIds.map(() => '?').join(',');
  const rows = local.raw
    .prepare(
      `SELECT customer_id AS customerId, COALESCE(SUM(points), 0) AS points
         FROM loyalty_entries
        WHERE business_id = ? AND customer_id IN (${placeholders})
        GROUP BY customer_id`
    )
    .all(businessId, ...customerIds) as Array<{ customerId: string; points: number }>;
  for (const r of rows) map.set(r.customerId, Math.max(0, r.points));
  return map;
}

async function assertTier(local: LocalDb, businessId: string, tierId: string | null | undefined): Promise<void> {
  if (tierId == null) return;
  const [row] = await local.db
    .select({ id: priceTiers.id })
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.id, tierId)))
    .limit(1)
    .all();
  if (!row) throw codedError('Price list not found', 'TIER_NOT_FOUND');
}

async function assertGroup(
  local: LocalDb,
  businessId: string,
  groupId: string | null | undefined
): Promise<void> {
  if (groupId == null) return;
  const [row] = await local.db
    .select({ id: customerGroups.id })
    .from(customerGroups)
    .where(and(eq(customerGroups.businessId, businessId), eq(customerGroups.id, groupId)))
    .limit(1);
  if (!row) throw codedError('Customer group not found', 'CUSTOMER_GROUP_NOT_FOUND');
}

export async function listCustomers(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: CustomerView[]; total: number; outstandingKobo: number }> {
  const query = customersQuerySchema.parse(raw ?? {});
  const clauses = [eq(customers.businessId, businessId)];
  if (!query.includeInactive) clauses.push(eq(customers.isActive, 1));
  if (query.search) {
    const term = `%${escLike(query.search)}%`;
    const match = or(
      like(customers.name, term),
      like(customers.phone, term),
      like(customers.email, term)
    );
    if (match) clauses.push(match);
  }
  const where = and(...clauses);

  const rows = await local.db
    .select()
    .from(customers)
    .where(where)
    .orderBy(customers.name)
    .limit(query.limit)
    .offset(query.offset);

  const [countRow] = await local.db
    .select({ n: sql<number>`count(*)` })
    .from(customers)
    .where(where);

  const outstanding = local.raw
    .prepare(
      `SELECT
      COALESCE((SELECT SUM(sp.amount_kobo)
                FROM sale_payments sp
                JOIN sales s ON s.id = sp.sale_id
                WHERE s.business_id = ? AND s.customer_id IS NOT NULL
                  AND s.status = 'completed' AND sp.method = 'credit'), 0)
      - COALESCE((SELECT SUM(amount_kobo) FROM customer_payments WHERE business_id = ?), 0) AS v`
    )
    .get(businessId, businessId) as { v: number } | undefined;

  const names = tierNames(local, businessId);
  const groups = groupNames(local, businessId);
  const points = pointsMap(local, businessId, rows.map((r) => r.id));
  return {
    items: rows.map((r) =>
      toView(
        r,
        balanceOf(local, businessId, r.id),
        r.priceTierId ? (names.get(r.priceTierId) ?? null) : null,
        points.get(r.id) ?? 0,
        r.groupId ? (groups.get(r.groupId) ?? null) : null
      )
    ),
    total: countRow?.n ?? 0,
    outstandingKobo: outstanding?.v ?? 0,
  };
}

export async function getCustomer(
  local: LocalDb,
  businessId: string,
  customerId: string
): Promise<CustomerView | null> {
  const [row] = await local.db
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .limit(1);
  if (!row) return null;
  const names = tierNames(local, businessId);
  const groups = groupNames(local, businessId);
  const points = pointsMap(local, businessId, [row.id]);
  return toView(
    row,
    balanceOf(local, businessId, row.id),
    row.priceTierId ? (names.get(row.priceTierId) ?? null) : null,
    points.get(row.id) ?? 0,
    row.groupId ? (groups.get(row.groupId) ?? null) : null
  );
}

export async function createCustomer(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string }> {
  requirePermission(new Set(grants), 'customers.manage');
  const input = customerSchema.parse(raw);
  await assertTier(local, businessId, input.priceTierId);
  await assertGroup(local, businessId, input.groupId);
  const id = newId('cus');
  const timestamp = new Date();
  local.db
    .insert(customers)
    .values({
      id,
      businessId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      note: input.note,
      creditLimitKobo: input.creditLimitKobo,
      priceTierId: input.priceTierId ?? null,
      groupId: input.groupId ?? null,
      isActive: 1,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'customer.create',
    entity: 'customer',
    entityId: id,
    details: { name: input.name },
  });
  return { id };
}

export async function updateCustomer(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  customerId: string,
  raw: unknown
): Promise<void> {
  requirePermission(new Set(grants), 'customers.manage');
  const patch = customerUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .limit(1);
  if (!existing) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');
  if (patch.priceTierId !== undefined) await assertTier(local, businessId, patch.priceTierId);
  if (patch.groupId !== undefined) await assertGroup(local, businessId, patch.groupId);

  const set: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.email !== undefined) set.email = patch.email;
  if (patch.address !== undefined) set.address = patch.address;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.creditLimitKobo !== undefined) set.creditLimitKobo = patch.creditLimitKobo;
  if (patch.priceTierId !== undefined) set.priceTierId = patch.priceTierId ?? null;
  if (patch.groupId !== undefined) set.groupId = patch.groupId ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive ? 1 : 0;

  local.db.update(customers).set(set).where(eq(customers.id, customerId)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'customer.update',
    entity: 'customer',
    entityId: customerId,
    details: patch,
  });
}

/** Archive a customer. Refused while they still owe money. */
export async function archiveCustomer(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  customerId: string
): Promise<void> {
  requirePermission(new Set(grants), 'customers.manage');
  const [existing] = await local.db
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .limit(1);
  if (!existing) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');

  const balance = balanceOf(local, businessId, customerId);
  if (balance > 0) {
    throw codedError(
      `Customer still owes ${(balance / 100).toFixed(2)}; settle the balance first`,
      'CUSTOMER_HAS_BALANCE'
    );
  }

  local.db
    .update(customers)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'customer.archive',
    entity: 'customer',
    entityId: customerId,
  });
}

/** Record money received against a customer's credit. */
export async function recordCustomerPayment(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; balanceKobo: number }> {
  requirePermission(new Set(grants), 'customers.manage');
  const input = customerPaymentSchema.parse(raw);

  const [customer] = await local.db
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, input.customerId)))
    .limit(1);
  if (!customer) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');

  if (input.saleId) {
    const [sale] = await local.db
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.businessId, businessId), eq(sales.id, input.saleId)))
      .limit(1);
    if (!sale) throw codedError('Sale not found', 'SALE_NOT_FOUND');
  }

  const id = newId('cp');
  const write = local.raw.transaction(() => {
    local.db
      .insert(customerPayments)
      .values({
        id,
        businessId,
        customerId: input.customerId,
        saleId: input.saleId ?? null,
        amountKobo: input.amountKobo,
        method: input.method,
        reference: input.reference,
        userId,
        createdAt: new Date(),
      })
      .run();

    postCustomerPaymentSync(local, businessId, {
      paymentId: id,
      amountKobo: input.amountKobo,
      method: input.method,
      reference: input.reference,
      accountId: input.accountId ?? null,
      customerName: customer.name,
      userId,
    });

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'customer.payment',
      entity: 'customer_payment',
      entityId: id,
      details: { customerId: input.customerId, amountKobo: input.amountKobo, method: input.method },
    });
  });
  write();

  return { id, balanceKobo: balanceOf(local, businessId, input.customerId) };
}

export interface CustomerPaymentView {
  id: string;
  amountKobo: number;
  method: string;
  reference: string;
  saleId: string | null;
  createdAt: string;
  userName: string | null;
}

export async function listCustomerPayments(
  local: LocalDb,
  businessId: string,
  customerId: string
): Promise<CustomerPaymentView[]> {
  const rows = local.raw
    .prepare(
      `SELECT p.id AS id, p.amount_kobo AS amountKobo, p.method AS method,
           p.reference AS reference, p.sale_id AS saleId, p.created_at AS createdAtMs,
           u.name AS userName
    FROM customer_payments p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.business_id = ? AND p.customer_id = ?
    ORDER BY p.created_at DESC, p.rowid DESC`
    )
    .all(businessId, customerId) as Array<{
    id: string;
    amountKobo: number;
    method: string;
    reference: string;
    saleId: string | null;
    createdAtMs: number;
    userName: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    amountKobo: r.amountKobo,
    method: r.method,
    reference: r.reference,
    saleId: r.saleId,
    createdAt: new Date(r.createdAtMs).toISOString(),
    userName: r.userName,
  }));
}
