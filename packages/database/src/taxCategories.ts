// Restaurant pack: named tax categories (e.g. Food 7.5%, Alcohol 10%).
// Products point at a category; NULL falls back to the business default
// rate, so pre-existing products and Batch 5 tests are unaffected.

import {
 taxCategorySchema,
 taxCategoryUpdateSchema,
} from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { businesses, taxCategories } from './schema';

function codedError(message: string, code: string): Error {
 const err = new Error(message);
 (err as NodeJS.ErrnoException).code = code;
 return err;
}

export interface TaxCategoryView {
 id: string;
 name: string;
 rateBps: number;
 isDefault: boolean;
}

function toView(r: typeof taxCategories.$inferSelect): TaxCategoryView {
 return { id: r.id, name: r.name, rateBps: r.rateBps, isDefault: r.isDefault === 1 };
}

export async function listTaxCategories(
 local: LocalDb,
 businessId: string,
): Promise<TaxCategoryView[]> {
 const rows = await local.db
 .select()
 .from(taxCategories)
 .where(eq(taxCategories.businessId, businessId))
 .orderBy(taxCategories.name);
 return rows.map(toView);
}

/** Lazy seed: ensure at least one category exists for the business. */
export async function ensureDefaultTaxCategory(
 local: LocalDb,
 businessId: string,
): Promise<TaxCategoryView> {
 const [existing] = await local.db
 .select()
 .from(taxCategories)
 .where(eq(taxCategories.businessId, businessId))
 .limit(1);
 if (existing) return toView(existing);
 const [biz] = await local.db
 .select({ taxRateBps: businesses.taxRateBps })
 .from(businesses)
 .where(eq(businesses.id, businessId))
 .limit(1);
 const rateBps = biz?.taxRateBps ?? 0;
 const timestamp = new Date();
 const id = newId('tax');
 local.db
 .insert(taxCategories)
 .values({
 id,
 businessId,
 name: 'Standard',
 rateBps,
 isDefault: 1,
 version: 1,
 createdAt: timestamp,
 updatedAt: timestamp,
 })
 .run();
 const [created] = await local.db
 .select()
 .from(taxCategories)
 .where(eq(taxCategories.id, id))
 .limit(1);
 return toView(created!);
}

export async function createTaxCategory(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 raw: unknown,
): Promise<TaxCategoryView> {
 requirePermission(new Set(grants), 'settings.manage');
 const input = taxCategorySchema.parse(raw);
 const name = input.name.trim();
 const [dup] = await local.db
 .select({ id: taxCategories.id })
 .from(taxCategories)
 .where(and(eq(taxCategories.businessId, businessId), eq(taxCategories.name, name)))
 .limit(1);
 if (dup) throw codedError(`Tax category "${name}" already exists`, 'TAX_CATEGORY_EXISTS');

 const timestamp = new Date();
 const id = newId('tax');
 const insert = local.raw.transaction(() => {
 if (input.isDefault) {
 local.db
 .update(taxCategories)
 .set({ isDefault: 0, updatedAt: timestamp })
 .where(eq(taxCategories.businessId, businessId))
 .run();
 }
 local.db
 .insert(taxCategories)
 .values({
 id,
 businessId,
 name,
 rateBps: input.rateBps,
 isDefault: input.isDefault ? 1 : 0,
 version: 1,
 createdAt: timestamp,
 updatedAt: timestamp,
 })
 .run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'tax-category.create',
 entity: 'tax_category',
 entityId: id,
 details: { name, rateBps: input.rateBps },
 });
 });
 insert();
 const [created] = await local.db
 .select()
 .from(taxCategories)
 .where(eq(taxCategories.id, id))
 .limit(1);
 return toView(created!);
}

export async function updateTaxCategory(
 local: LocalDb,
 businessId: string,
 userId: string,
 grants: string[],
 taxCategoryId: string,
 raw: unknown,
): Promise<TaxCategoryView> {
 requirePermission(new Set(grants), 'settings.manage');
 const input = taxCategoryUpdateSchema.parse(raw);
 const [existing] = await local.db
 .select()
 .from(taxCategories)
 .where(and(eq(taxCategories.id, taxCategoryId), eq(taxCategories.businessId, businessId)))
 .limit(1);
 if (!existing) throw codedError('Tax category not found', 'TAX_CATEGORY_NOT_FOUND');

 const name = input.name !== undefined ? input.name.trim() : existing.name;
 if (name !== existing.name) {
 const [dup] = await local.db
 .select({ id: taxCategories.id })
 .from(taxCategories)
 .where(and(eq(taxCategories.businessId, businessId), eq(taxCategories.name, name)))
 .limit(1);
 if (dup) throw codedError(`Tax category "${name}" already exists`, 'TAX_CATEGORY_EXISTS');
 }

 const timestamp = new Date();
 const apply = local.raw.transaction(() => {
 if (input.isDefault) {
 local.db
 .update(taxCategories)
 .set({ isDefault: 0, updatedAt: timestamp })
 .where(eq(taxCategories.businessId, businessId))
 .run();
 }
 local.db
 .update(taxCategories)
 .set({
 ...(input.name !== undefined ? { name } : {}),
 ...(input.rateBps !== undefined ? { rateBps: input.rateBps } : {}),
 ...(input.isDefault !== undefined ? { isDefault: input.isDefault ? 1 : 0 } : {}),
 updatedAt: timestamp,
 version: existing.version + 1,
 })
 .where(eq(taxCategories.id, taxCategoryId))
 .run();
 writeAuditSync(local, {
 businessId,
 userId,
 action: 'tax-category.update',
 entity: 'tax_category',
 entityId: taxCategoryId,
 details: { name },
 });
 });
 apply();
 const [updated] = await local.db
 .select()
 .from(taxCategories)
 .where(eq(taxCategories.id, taxCategoryId))
 .limit(1);
 return toView(updated!);
}
