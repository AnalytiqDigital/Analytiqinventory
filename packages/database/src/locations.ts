// Batch 8: multi-branch locations. Every business starts with one default
// location; owners can add more and choose which one is the default for new
// stock and sales.

import { locationSchema, locationUpdateSchema } from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { locations } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export interface LocationView {
  id: string;
  name: string;
  address: string;
  state: string;
  lga: string;
  isDefault: boolean;
  version: number;
}

function toView(row: typeof locations.$inferSelect): LocationView {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    state: row.state,
    lga: row.lga,
    isDefault: row.isDefault === 1,
    version: row.version,
  };
}

export async function listLocations(local: LocalDb, businessId: string): Promise<LocationView[]> {
  const rows = await local.db
    .select()
    .from(locations)
    .where(eq(locations.businessId, businessId))
    .orderBy(locations.name);
  return rows
    .map(toView)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export async function createLocation(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<LocationView> {
  requirePermission(new Set(grants), 'settings.manage');
  const input = locationSchema.parse(raw);
  const name = input.name.trim();
  const [dup] = await local.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.businessId, businessId), eq(locations.name, name)))
    .limit(1);
  if (dup) throw codedError(`Location "${name}" already exists`, 'LOCATION_EXISTS');

  const timestamp = new Date();
  const id = newId('loc');
  local.raw.transaction(() => {
    local.db
      .insert(locations)
      .values({
        id,
        businessId,
        name,
        address: input.address,
        state: input.state,
        lga: input.lga,
        isDefault: 0,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'location.create',
      entity: 'location',
      entityId: id,
      details: { name },
    });
  })();

  const [created] = await local.db.select().from(locations).where(eq(locations.id, id)).limit(1);
  return toView(created!);
}

export async function updateLocation(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  locationId: string,
  raw: unknown
): Promise<LocationView> {
  requirePermission(new Set(grants), 'settings.manage');
  const input = locationUpdateSchema.parse(raw);
  const [existing] = await local.db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Location not found', 'LOCATION_NOT_FOUND');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (name !== existing.name) {
    const [dup] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.businessId, businessId), eq(locations.name, name)))
      .limit(1);
    if (dup) throw codedError(`Location "${name}" already exists`, 'LOCATION_EXISTS');
  }

  const timestamp = new Date();
  local.raw.transaction(() => {
    if (input.isDefault === true) {
      local.db
        .update(locations)
        .set({ isDefault: 0, updatedAt: timestamp })
        .where(eq(locations.businessId, businessId))
        .run();
    }
    local.db
      .update(locations)
      .set({
        ...(input.name !== undefined ? { name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault ? 1 : 0 } : {}),
        updatedAt: timestamp,
        version: existing.version + 1,
      })
      .where(eq(locations.id, locationId))
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'location.update',
      entity: 'location',
      entityId: locationId,
      details: { name },
    });
  })();

  const [updated] = await local.db
    .select()
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  return toView(updated!);
}
