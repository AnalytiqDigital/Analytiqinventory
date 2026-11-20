// Batch 16: shop-floor masters.
//
// Brands, units, warranties and customer groups are small per-business lookup
// lists. They are archived (is_active = 0) rather than deleted so products and
// customers keep a readable reference. Units are a suggestion list for the
// product form: products keep their free-text `unit`, so existing rows and
// imports are unaffected.

import {
  masterNameSchema,
  masterUpdateSchema,
  unitSchema,
  unitUpdateSchema,
  warrantySchema,
  warrantyUpdateSchema,
} from '@analytiq/validation';
import { and, asc, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { brands, customerGroups, units, warranties } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export interface MasterView {
  id: string;
  name: string;
  note: string;
  shortName?: string;
  durationDays?: number;
  isActive: boolean;
  createdAt: string;
}

function toView(row: {
  id: string;
  name: string;
  note: string;
  isActive: number;
  createdAt: Date;
  shortName?: string;
  durationDays?: number;
}): MasterView {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    ...(row.shortName !== undefined ? { shortName: row.shortName } : {}),
    ...(row.durationDays !== undefined ? { durationDays: row.durationDays } : {}),
    isActive: row.isActive === 1,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireName(
  grants: string[],
  permission: 'products.manage' | 'customers.manage'
): void {
  requirePermission(new Set(grants), permission);
}

type MasterTable = 'brands' | 'units' | 'warranties' | 'customer_groups';

function assertNameFree(
  local: LocalDb,
  table: MasterTable,
  businessId: string,
  name: string,
  exceptId?: string
): void {
  const sqlText = `SELECT id FROM ${table} WHERE business_id = ? AND lower(name) = lower(?)`;
  const row = exceptId
    ? local.raw.prepare(`${sqlText} AND id <> ? LIMIT 1`).get(businessId, name, exceptId)
    : local.raw.prepare(`${sqlText} LIMIT 1`).get(businessId, name);
  if (row) throw codedError(`"${name}" already exists`, 'MASTER_EXISTS');
}

// --- brands -----------------------------------------------------------------

export async function listBrands(local: LocalDb, businessId: string): Promise<MasterView[]> {
  const rows = await local.db
    .select()
    .from(brands)
    .where(eq(brands.businessId, businessId))
    .orderBy(asc(brands.name));
  return rows.map(toView);
}

export async function createBrand(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = masterNameSchema.parse(raw);
  assertNameFree(local, 'brands', businessId, input.name);
  const timestamp = new Date();
  const id = newId('brd');
  local.db
    .insert(brands)
    .values({
      id,
      businessId,
      name: input.name,
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
    action: 'brand.create',
    entity: 'brand',
    entityId: id,
    details: { name: input.name },
  });
  return toView({ id, name: input.name, note: input.note, isActive: 1, createdAt: timestamp });
}

export async function updateBrand(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  id: string,
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = masterUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(brands)
    .where(and(eq(brands.id, id), eq(brands.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Brand not found', 'BRAND_NOT_FOUND');
  if (input.name !== undefined) assertNameFree(local, 'brands', businessId, input.name, id);
  const next = {
    name: input.name ?? existing.name,
    note: input.note ?? existing.note,
    isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
    updatedAt: new Date(),
  };
  local.db.update(brands).set(next).where(eq(brands.id, id)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'brand.update',
    entity: 'brand',
    entityId: id,
    details: { fields: Object.keys(input) },
  });
  return toView({ ...existing, ...next });
}

// --- units ------------------------------------------------------------------

export async function listUnits(local: LocalDb, businessId: string): Promise<MasterView[]> {
  const rows = await local.db
    .select()
    .from(units)
    .where(eq(units.businessId, businessId))
    .orderBy(asc(units.name));
  return rows.map(toView);
}

export async function createUnit(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = unitSchema.parse(raw);
  assertNameFree(local, 'units', businessId, input.name);
  const timestamp = new Date();
  const id = newId('unt');
  local.db
    .insert(units)
    .values({
      id,
      businessId,
      name: input.name,
      shortName: input.shortName,
      isActive: 1,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'unit.create',
    entity: 'unit',
    entityId: id,
    details: { name: input.name },
  });
  return toView({
    id,
    name: input.name,
    note: input.note,
    shortName: input.shortName,
    isActive: 1,
    createdAt: timestamp,
  });
}

export async function updateUnit(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  id: string,
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = unitUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(units)
    .where(and(eq(units.id, id), eq(units.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Unit not found', 'UNIT_NOT_FOUND');
  if (input.name !== undefined) assertNameFree(local, 'units', businessId, input.name, id);
  const next = {
    name: input.name ?? existing.name,
    note: input.note ?? existing.note,
    shortName: input.shortName ?? existing.shortName,
    isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
    updatedAt: new Date(),
  };
  local.db.update(units).set(next).where(eq(units.id, id)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'unit.update',
    entity: 'unit',
    entityId: id,
    details: { fields: Object.keys(input) },
  });
  return toView({ ...existing, ...next });
}

// --- warranties -------------------------------------------------------------

export async function listWarranties(local: LocalDb, businessId: string): Promise<MasterView[]> {
  const rows = await local.db
    .select()
    .from(warranties)
    .where(eq(warranties.businessId, businessId))
    .orderBy(asc(warranties.name));
  return rows.map(toView);
}

export async function createWarranty(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = warrantySchema.parse(raw);
  assertNameFree(local, 'warranties', businessId, input.name);
  const timestamp = new Date();
  const id = newId('wrt');
  local.db
    .insert(warranties)
    .values({
      id,
      businessId,
      name: input.name,
      durationDays: input.durationDays,
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
    action: 'warranty.create',
    entity: 'warranty',
    entityId: id,
    details: { name: input.name, durationDays: input.durationDays },
  });
  return toView({
    id,
    name: input.name,
    note: input.note,
    durationDays: input.durationDays,
    isActive: 1,
    createdAt: timestamp,
  });
}

export async function updateWarranty(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  id: string,
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'products.manage');
  const input = warrantyUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(warranties)
    .where(and(eq(warranties.id, id), eq(warranties.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Warranty not found', 'WARRANTY_NOT_FOUND');
  if (input.name !== undefined) assertNameFree(local, 'warranties', businessId, input.name, id);
  const next = {
    name: input.name ?? existing.name,
    note: input.note ?? existing.note,
    durationDays: input.durationDays ?? existing.durationDays,
    isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
    updatedAt: new Date(),
  };
  local.db.update(warranties).set(next).where(eq(warranties.id, id)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'warranty.update',
    entity: 'warranty',
    entityId: id,
    details: { fields: Object.keys(input) },
  });
  return toView({ ...existing, ...next });
}

// --- customer groups --------------------------------------------------------

export async function listCustomerGroups(
  local: LocalDb,
  businessId: string
): Promise<MasterView[]> {
  const rows = await local.db
    .select()
    .from(customerGroups)
    .where(eq(customerGroups.businessId, businessId))
    .orderBy(asc(customerGroups.name));
  return rows.map(toView);
}

export async function createCustomerGroup(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'customers.manage');
  const input = masterNameSchema.parse(raw);
  assertNameFree(local, 'customer_groups', businessId, input.name);
  const timestamp = new Date();
  const id = newId('cgr');
  local.db
    .insert(customerGroups)
    .values({
      id,
      businessId,
      name: input.name,
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
    action: 'customer_group.create',
    entity: 'customer_group',
    entityId: id,
    details: { name: input.name },
  });
  return toView({ id, name: input.name, note: input.note, isActive: 1, createdAt: timestamp });
}

export async function updateCustomerGroup(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  id: string,
  raw: unknown
): Promise<MasterView> {
  requireName(grants, 'customers.manage');
  const input = masterUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(customerGroups)
    .where(and(eq(customerGroups.id, id), eq(customerGroups.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Customer group not found', 'CUSTOMER_GROUP_NOT_FOUND');
  if (input.name !== undefined) {
    assertNameFree(local, 'customer_groups', businessId, input.name, id);
  }
  const next = {
    name: input.name ?? existing.name,
    note: input.note ?? existing.note,
    isActive: input.isActive === undefined ? existing.isActive : input.isActive ? 1 : 0,
    updatedAt: new Date(),
  };
  local.db.update(customerGroups).set(next).where(eq(customerGroups.id, id)).run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'customer_group.update',
    entity: 'customer_group',
    entityId: id,
    details: { fields: Object.keys(input) },
  });
  return toView({ ...existing, ...next });
}
