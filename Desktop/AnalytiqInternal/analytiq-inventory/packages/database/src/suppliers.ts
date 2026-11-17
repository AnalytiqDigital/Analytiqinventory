// Batch 6: suppliers. Simple contact records referenced by purchases.
// Archived (is_active = 0), never deleted, so purchase history keeps them.

import { supplierSchema, supplierUpdateSchema, suppliersQuerySchema } from '@analytiq/validation';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { purchases, suppliers } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface SupplierView {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  isActive: boolean;
  /** How many purchases reference this supplier. */
  purchaseCount: number;
  createdAt: string;
}

function toView(row: typeof suppliers.$inferSelect, purchaseCount: number): SupplierView {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    note: row.note,
    isActive: row.isActive === 1,
    purchaseCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function purchaseCountOf(local: LocalDb, supplierId: string): number {
  const row = local.raw
    .prepare('SELECT COUNT(*) AS n FROM purchases WHERE supplier_id = ?')
    .get(supplierId) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function listSuppliers(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: SupplierView[]; total: number }> {
  const query = suppliersQuerySchema.parse(raw ?? {});
  const clauses = [eq(suppliers.businessId, businessId)];
  if (!query.includeInactive) clauses.push(eq(suppliers.isActive, 1));
  if (query.search) {
    const term = `%${escLike(query.search)}%`;
    const match = or(
      like(suppliers.name, term),
      like(suppliers.contactName, term),
      like(suppliers.phone, term)
    );
    if (match) clauses.push(match);
  }
  const where = and(...clauses);

  const rows = await local.db
    .select()
    .from(suppliers)
    .where(where)
    .orderBy(suppliers.name)
    .limit(query.limit)
    .offset(query.offset);

  const [countRow] = await local.db
    .select({ n: sql<number>`count(*)` })
    .from(suppliers)
    .where(where);

  return {
    items: rows.map((r) => toView(r, purchaseCountOf(local, r.id))),
    total: countRow?.n ?? 0,
  };
}

export async function createSupplier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string }> {
  requirePermission(new Set(grants), 'suppliers.manage');
  const input = supplierSchema.parse(raw);
  const id = newId('sup');
  const timestamp = new Date();
  local.db
    .insert(suppliers)
    .values({
      id,
      businessId,
      name: input.name,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      note: input.note,
      isActive: 1,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'supplier.create',
    entity: 'supplier',
    entityId: id,
    details: { name: input.name },
  });
  return { id };
}

export async function updateSupplier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  supplierId: string,
  raw: unknown
): Promise<void> {
  requirePermission(new Set(grants), 'suppliers.manage');
  const patch = supplierUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.businessId, businessId), eq(suppliers.id, supplierId)))
    .limit(1);
  if (!existing) throw codedError('Supplier not found', 'SUPPLIER_NOT_FOUND');

  const set: Partial<typeof suppliers.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.contactName !== undefined) set.contactName = patch.contactName;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.email !== undefined) set.email = patch.email;
  if (patch.address !== undefined) set.address = patch.address;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.isActive !== undefined) set.isActive = patch.isActive ? 1 : 0;

  local.db.update(suppliers).set(set).where(eq(suppliers.id, supplierId)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'supplier.update',
    entity: 'supplier',
    entityId: supplierId,
    details: patch,
  });
}

/** Archive a supplier. Refused while draft purchases still reference them. */
export async function archiveSupplier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  supplierId: string
): Promise<void> {
  requirePermission(new Set(grants), 'suppliers.manage');
  const [existing] = await local.db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.businessId, businessId), eq(suppliers.id, supplierId)))
    .limit(1);
  if (!existing) throw codedError('Supplier not found', 'SUPPLIER_NOT_FOUND');

  const [draft] = await local.db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.supplierId, supplierId), eq(purchases.status, 'draft')))
    .limit(1);
  if (draft) {
    throw codedError(
      'Supplier has draft purchases; receive or cancel them first',
      'SUPPLIER_HAS_DRAFTS'
    );
  }

  local.db
    .update(suppliers)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(eq(suppliers.id, supplierId))
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'supplier.archive',
    entity: 'supplier',
    entityId: supplierId,
  });
}
