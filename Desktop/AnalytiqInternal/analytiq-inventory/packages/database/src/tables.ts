// Restaurant pack: dining tables are occupancy tags, not held-cart rows.
// The POS cart gains an optional tableId; saleCreate validates the table is
// free (same business + location) and flips it to occupied in the same
// transaction, then releases it when the sale completes. Refunds of a
// completed sale release nothing (the table is already free).

import {
 tableSchema,
 tableStatusSchema,
 tableUpdateSchema,
 tablesQuerySchema,
 type TableStatus,
} from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { getDefaultLocationId } from './inventory';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { diningTables, locations, sales } from './schema';

function codedError(message: string, code: string): Error {
 const err = new Error(message);
 (err as NodeJS.ErrnoException).code = code;
 return err;
}

export interface TableView {
 id: string;
 locationId: string;
 locationName: string;
 name: string;
 seats: number;
 status: TableStatus;
 note: string;
}

async function resolveLocationId(
 local: LocalDb,
 businessId: string,
 requested: string | null | undefined,
): Promise<string> {
 if (requested) {
 const [row] = await local.db
 .select({ id: locations.id })
 .from(locations)
 .where(and(eq(locations.id, requested), eq(locations.businessId, businessId)))
 .limit(1);
 if (!row) throw codedError('Location not found', 'LOCATION_NOT_FOUND');
 return row.id;
 }
 const fallback = await getDefaultLocationId(local, businessId);
 if (!fallback) throw codedError('No location set up for this business', 'NO_LOCATION');
 return fallback;
}

async function getTableRow(local: LocalDb, businessId: string, tableId: string) {
 const [row] = await local.db
 .select({
 id: diningTables.id,
 locationId: diningTables.locationId,
 locationName: locations.name,
 name: diningTables.name,
 seats: diningTables.seats,
 status: diningTables.status,
 note: diningTables.note,
 })
 .from(diningTables)
 .leftJoin(locations, eq(diningTables.locationId, locations.id))
 .where(and(eq(diningTables.id, tableId), eq(diningTables.businessId, businessId)))
 .limit(1);
 return row ?? null;
}

export async function listTables(
 local: LocalDb,
 businessId: string,
 rawQuery: unknown,
): Promise<TableView[]> {
 const q = tablesQuerySchema.parse(rawQuery ?? {});
 const locationId = q.locationId
 ? await resolveLocationId(local, businessId, q.locationId)
 : undefined;
 const conditions = [eq(diningTables.businessId, businessId)];
 if (locationId) conditions.push(eq(diningTables.locationId, locationId));
 if (q.status) conditions.push(eq(diningTables.status, q.status));
 const rows = await local.db
 .select({
 id: diningTables.id,
 locationId: diningTables.locationId,
 locationName: locations.name,
 name: diningTables.name,
 seats: diningTables.seats,
 status: diningTables.status,
 note: diningTables.note,
 })
 .from(diningTables)
 .leftJoin(locations, eq(diningTables.locationId, locations.id))
 .where(and(...conditions))
 .orderBy(diningTables.name);
 return rows.map((r) => ({
 id: r.id,
 locationId: r.locationId,
 locationName: r.locationName ?? '',
 name: r.name,
 seats: r.seats,
 status: r.status as TableStatus,
 note: r.note,
 }));
}

export async function createTable(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 raw: unknown,
): Promise<TableView> {
 requirePermission(new Set(grants), 'sales.create');
 const input = tableSchema.parse(raw);
 const locationId = await resolveLocationId(local, businessId, input.locationId);
 const name = input.name.trim();
 const [dup] = await local.db
 .select({ id: diningTables.id })
 .from(diningTables)
 .where(and(eq(diningTables.locationId, locationId), eq(diningTables.name, name)))
 .limit(1);
 if (dup) throw codedError(`Table "${name}" already exists at this location`, 'TABLE_EXISTS');

 const timestamp = new Date();
 const id = newId('tbl');
 const insert = local.raw.transaction(() => {
 local.db
 .insert(diningTables)
 .values({
 id,
 businessId,
 locationId,
 name,
 seats: input.seats,
 status: 'free',
 note: input.note,
 version: 1,
 createdAt: timestamp,
 updatedAt: timestamp,
 })
 .run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'table.create',
 entity: 'dining_table',
 entityId: id,
 details: { name, locationId },
 });
 });
 insert();
 const row = await getTableRow(local, businessId, id);
 return {
 id: row!.id,
 locationId: row!.locationId,
 locationName: row!.locationName ?? '',
 name: row!.name,
 seats: row!.seats,
 status: row!.status as TableStatus,
 note: row!.note,
 };
}

export async function updateTable(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 tableId: string,
 raw: unknown,
): Promise<TableView> {
 requirePermission(new Set(grants), 'sales.create');
 const input = tableUpdateSchema.parse(raw);
 const existing = await getTableRow(local, businessId, tableId);
 if (!existing) throw codedError('Table not found', 'TABLE_NOT_FOUND');

 const locationId = input.locationId !== undefined
 ? await resolveLocationId(local, businessId, input.locationId)
 : existing.locationId;
 const name = input.name !== undefined ? input.name.trim() : existing.name;
 if (name !== existing.name || locationId !== existing.locationId) {
 const [dup] = await local.db
 .select({ id: diningTables.id })
 .from(diningTables)
 .where(and(eq(diningTables.locationId, locationId), eq(diningTables.name, name)))
 .limit(1);
 if (dup && dup.id !== tableId) {
 throw codedError(`Table "${name}" already exists at this location`, 'TABLE_EXISTS');
 }
 }

 const apply = local.raw.transaction(() => {
 local.db
 .update(diningTables)
 .set({
 ...(input.locationId !== undefined ? { locationId } : {}),
 ...(input.name !== undefined ? { name } : {}),
 ...(input.seats !== undefined ? { seats: input.seats } : {}),
 ...(input.note !== undefined ? { note: input.note } : {}),
 updatedAt: new Date(),
 })
 .where(eq(diningTables.id, tableId))
 .run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'table.update',
 entity: 'dining_table',
 entityId: tableId,
 details: { name },
 });
 });
 apply();
 const row = await getTableRow(local, businessId, tableId);
 return {
 id: row!.id,
 locationId: row!.locationId,
 locationName: row!.locationName ?? '',
 name: row!.name,
 seats: row!.seats,
 status: row!.status as TableStatus,
 note: row!.note,
 };
}

export async function setTableStatus(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 tableId: string,
 raw: unknown,
): Promise<TableView> {
 requirePermission(new Set(grants), 'sales.create');
 const input = tableStatusSchema.parse(raw);
 const existing = await getTableRow(local, businessId, tableId);
 if (!existing) throw codedError('Table not found', 'TABLE_NOT_FOUND');

 local.db
 .update(diningTables)
 .set({ status: input.status, note: input.note, updatedAt: new Date() })
 .where(eq(diningTables.id, tableId))
 .run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'table.status',
 entity: 'dining_table',
 entityId: tableId,
 details: { status: input.status },
 });
 const row = await getTableRow(local, businessId, tableId);
 return {
 id: row!.id,
 locationId: row!.locationId,
 locationName: row!.locationName ?? '',
 name: row!.name,
 seats: row!.seats,
 status: row!.status as TableStatus,
 note: row!.note,
 };
}

export async function deleteTable(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 tableId: string,
): Promise<{ ok: true }> {
 requirePermission(new Set(grants), 'sales.create');
 const existing = await getTableRow(local, businessId, tableId);
 if (!existing) throw codedError('Table not found', 'TABLE_NOT_FOUND');
 if (existing.status === 'occupied') {
 throw codedError(`Table "${existing.name}" is occupied and cannot be removed`, 'TABLE_OCCUPIED');
 }
 const [referenced] = await local.db.select({ id: sales.id }).from(sales).where(eq(sales.tableId, tableId)).limit(1);
if (referenced) throw codedError(`Table "${existing.name}" has sales on record and cannot be removed`, 'TABLE_HAS_SALES');
const remove = local.raw.transaction(() => {
 local.db.delete(diningTables).where(eq(diningTables.id, tableId)).run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'table.delete',
 entity: 'dining_table',
 entityId: tableId,
 details: { name: existing.name },
 });
 });
 remove();
 return { ok: true };
}
