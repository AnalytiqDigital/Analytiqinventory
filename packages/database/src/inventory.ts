// Batch 4: products + append-only inventory ledger.
//
// LEDGER RULE (locked): stock on hand is ALWAYS derived from
// `stock_movements`. There is no balance column to overwrite — receipts,
// adjustments, and counts append rows with a running `qty_after` snapshot.
// Negative on-hand is rejected: stock cannot go below zero.

import {
  categorySchema,
  levelsQuerySchema,
  movementsQuerySchema,
  productListQuerySchema,
  productSchema,
  productUpdateSchema,
  stockAdjustSchema,
  stockCountSchema,
} from '@analytiq/validation';
import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { newId } from './auth';
import { ensureBatch } from './batches';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { brands, categories, locations, products, stockMovements, taxCategories, warranties } from './schema';

export const STOCK_KINDS = [
  'opening',
  'adjust',
  'count',
  'sale',
  'purchase',
  'return',
  'transfer_out',
  'transfer_in',
  'purchase_return',
] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

const productCreateSchema = productSchema.extend({
  locationId: z.string().trim().min(1).nullish(),
});

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// --- locations ---------------------------------------------------------------

export async function getDefaultLocationId(local: LocalDb, businessId: string): Promise<string | null> {
  const [row] = await local.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.businessId, businessId), eq(locations.isDefault, 1)))
    .limit(1);
  return row?.id ?? null;
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

function onHandSum(local: LocalDb, businessId: string, productId: string, locationId: string): number {
  const row = local.raw
    .prepare(
      'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?',
    )
    .get(businessId, productId, locationId) as { qty: number };
  return row.qty;
}

// --- categories --------------------------------------------------------------

export interface CategoryView {
  id: string;
  name: string;
  description: string;
}

export async function listCategories(local: LocalDb, businessId: string): Promise<CategoryView[]> {
  const rows = await local.db
    .select({ id: categories.id, name: categories.name, description: categories.description })
    .from(categories)
    .where(eq(categories.businessId, businessId))
    .orderBy(categories.name);
  return rows;
}

export async function createCategory(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
): Promise<CategoryView> {
  requirePermission(new Set(grants), 'products.manage');
  const input = categorySchema.parse(raw);
  const name = input.name.trim();
  const [dup] = await local.db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.businessId, businessId), eq(categories.name, name)))
    .limit(1);
  if (dup) throw codedError(`Category "${name}" already exists`, 'CATEGORY_EXISTS');

  const timestamp = new Date();
  const id = newId('cat');
  const insert = local.raw.transaction(() => {
    local.db.insert(categories).values({
      id,
      businessId,
      name,
      description: input.description,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'category.create',
      entity: 'category',
      entityId: id,
      details: { name },
    });
  });
  insert();
  return { id, name, description: input.description };
}

/** Rename or re-describe a category. Archived categories are not a concept:
 * products keep their reference, so renaming is safe. */
export async function updateCategory(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  categoryId: string,
  raw: unknown,
): Promise<CategoryView> {
  requirePermission(new Set(grants), 'products.manage');
  const input = z
    .object({
      name: z.string().trim().min(2, 'Category name is required').max(120).optional(),
      description: z.string().trim().max(500).optional(),
    })
    .parse(raw);
  const [existing] = await local.db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.businessId, businessId)))
    .limit(1);
  if (!existing) throw codedError('Category not found', 'CATEGORY_NOT_FOUND');
  const name = input.name ?? existing.name;
  if (input.name !== undefined) {
    const [dup] = await local.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.businessId, businessId), eq(categories.name, name)))
      .limit(1);
    if (dup && dup.id !== categoryId) {
      throw codedError(`Category "${name}" already exists`, 'CATEGORY_EXISTS');
    }
  }
  const description = input.description ?? existing.description;
  local.db
    .update(categories)
    .set({ name, description, updatedAt: new Date() })
    .where(eq(categories.id, categoryId))
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'category.update',
    entity: 'category',
    entityId: categoryId,
    details: { name },
  });
  return { id: categoryId, name, description };
}

// --- products ----------------------------------------------------------------

export interface ProductWithStock {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  warrantyId: string | null;
  warrantyName: string | null;
  unit: string;
  costPriceKobo: number;
  sellingPriceKobo: number;
  reorderLevel: number;
  imagePath: string;
  taxCategoryId: string | null;
  trackBatches: number;
  nearExpiryDays: number;
  isActive: number;
  onHand: number;
  lowStock: boolean;
}

export interface ProductDetail extends ProductWithStock {
  levels: Array<{ locationId: string; locationName: string; onHand: number }>;
}

async function onHandMap(
  local: LocalDb,
  businessId: string,
  productIds: string[],
  locationId: string | null,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;
  const placeholders = productIds.map(() => '?').join(',');
  const rows = (
    locationId
      ? local.raw
          .prepare(
            `SELECT product_id AS productId, COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND location_id = ? AND product_id IN (${placeholders}) GROUP BY product_id`,
          )
          .all(businessId, locationId, ...productIds)
      : local.raw
          .prepare(
            `SELECT product_id AS productId, COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id IN (${placeholders}) GROUP BY product_id`,
          )
          .all(businessId, ...productIds)
  ) as Array<{ productId: string; qty: number }>;
  for (const r of rows) map.set(r.productId, r.qty);
  return map;
}

export async function listProducts(
  local: LocalDb,
  businessId: string,
  rawQuery: unknown,
): Promise<{ items: ProductWithStock[]; total: number }> {
  const q = productListQuerySchema.parse(rawQuery);
  const conditions: SQL<unknown>[] = [eq(products.businessId, businessId)];
  if (!q.includeInactive) conditions.push(eq(products.isActive, 1));
  if (q.categoryId) conditions.push(eq(products.categoryId, q.categoryId));
  if (q.search) {
    const pattern = `%${escLike(q.search)}%`;
    // NOTE: '\\' in this template literal produces a single backslash in the
    // SQL sent to SQLite, i.e. ESCAPE '\'. A single backslash here would
    // collapse the SQL string literal and break the query.
    conditions.push(
      sql`(${products.name} LIKE ${pattern} ESCAPE '\\' OR ${products.sku} LIKE ${pattern} ESCAPE '\\' OR ${products.barcode} LIKE ${pattern} ESCAPE '\\')`,
    );
  }
  const where = and(...conditions);

  const [totalRow] = await local.db.select({ n: count() }).from(products).where(where);
  const rows = await local.db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      warrantyId: products.warrantyId,
      warrantyName: warranties.name,
      unit: products.unit,
      costPriceKobo: products.costPriceKobo,
      sellingPriceKobo: products.sellingPriceKobo,
      reorderLevel: products.reorderLevel,
      imagePath: products.imagePath,
      taxCategoryId: products.taxCategoryId,
      trackBatches: products.trackBatches,
      nearExpiryDays: products.nearExpiryDays,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(warranties, eq(products.warrantyId, warranties.id))
    .where(where)
    .orderBy(products.name)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  const onHand = await onHandMap(
    local,
    businessId,
    rows.map((r) => r.id),
    q.locationId ?? null,
  );
  const items: ProductWithStock[] = rows.map((r) => {
    const qty = onHand.get(r.id) ?? 0;
    return { ...r, onHand: qty, lowStock: qty <= r.reorderLevel };
  });
  return { items, total: totalRow?.n ?? 0 };
}

async function getProductRow(local: LocalDb, businessId: string, productId: string) {
  const [row] = await local.db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      warrantyId: products.warrantyId,
      warrantyName: warranties.name,
      unit: products.unit,
      costPriceKobo: products.costPriceKobo,
      sellingPriceKobo: products.sellingPriceKobo,
      reorderLevel: products.reorderLevel,
      imagePath: products.imagePath,
      taxCategoryId: products.taxCategoryId,
      trackBatches: products.trackBatches,
      nearExpiryDays: products.nearExpiryDays,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(warranties, eq(products.warrantyId, warranties.id))
    .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
    .limit(1);
  return row ?? null;
}

export async function getProduct(
  local: LocalDb,
  businessId: string,
  productId: string,
): Promise<ProductDetail> {
  const row = await getProductRow(local, businessId, productId);
  if (!row) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  const locs = await local.db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.businessId, businessId))
    .orderBy(locations.name);
  const onHand = await onHandMap(
    local,
    businessId,
    [row.id],
    null,
  );
  const levels = locs.map((l) => ({
    locationId: l.id,
    locationName: l.name,
    onHand: onHandSum(local, businessId, row.id, l.id),
  }));
  const total = onHand.get(row.id) ?? 0;
  return { ...row, onHand: total, lowStock: total <= row.reorderLevel, levels };
}

/**
 * Exact scan lookup for a hardware barcode scanner. Barcodes and SKUs are
 * unique per business, so at most one active product matches. Returns null
 * rather than throwing — the POS beeps/flags an unknown scan.
 */
export async function productByBarcode(
  local: LocalDb,
  businessId: string,
  rawCode: string,
): Promise<ProductWithStock | null> {
  const code = rawCode.trim();
  if (!code) return null;
  const [row] = await local.db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryId: products.categoryId,
      categoryName: categories.name,
      brandId: products.brandId,
      brandName: brands.name,
      warrantyId: products.warrantyId,
      warrantyName: warranties.name,
      unit: products.unit,
      costPriceKobo: products.costPriceKobo,
      sellingPriceKobo: products.sellingPriceKobo,
      reorderLevel: products.reorderLevel,
      imagePath: products.imagePath,
      taxCategoryId: products.taxCategoryId,
      trackBatches: products.trackBatches,
      nearExpiryDays: products.nearExpiryDays,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(warranties, eq(products.warrantyId, warranties.id))
    .where(
      and(
        eq(products.businessId, businessId),
        eq(products.isActive, 1),
        sql`(${products.barcode} = ${code} OR ${products.sku} = ${code})`,
      ),
    )
    .limit(1);
  if (!row) return null;
  const onHand = await onHandMap(local, businessId, [row.id], null);
  const qty = onHand.get(row.id) ?? 0;
  return { ...row, onHand: qty, lowStock: qty <= row.reorderLevel };
}

async function assertUniqueCode(
  local: LocalDb,
  businessId: string,
  field: 'sku' | 'barcode',
  value: string | null,
  excludeId?: string,
): Promise<void> {
  if (value == null) return;
  const col = field === 'sku' ? products.sku : products.barcode;
  const [dup] = await local.db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(col, value)))
    .limit(1);
  if (dup && dup.id !== excludeId) {
    throw codedError(
      field === 'sku' ? `SKU "${value}" is already used` : `Barcode "${value}" is already used`,
      field === 'sku' ? 'SKU_EXISTS' : 'BARCODE_EXISTS',
    );
  }
}

async function assertTaxCategoryInBusiness(
  local: LocalDb,
  businessId: string,
  taxCategoryId: string | null | undefined,
): Promise<void> {
  if (taxCategoryId == null) return;
  const [row] = await local.db
    .select({ id: taxCategories.id })
    .from(taxCategories)
    .where(and(eq(taxCategories.id, taxCategoryId), eq(taxCategories.businessId, businessId)))
    .limit(1);
  if (!row) throw codedError('Tax category not found', 'TAX_CATEGORY_NOT_FOUND');
}

async function assertCategoryInBusiness(
  local: LocalDb,
  businessId: string,
  categoryId: string | null | undefined,
): Promise<void> {
  if (categoryId == null) return;
  const [row] = await local.db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.businessId, businessId)))
    .limit(1);
  if (!row) throw codedError('Category not found', 'CATEGORY_NOT_FOUND');
}

async function assertBrandInBusiness(
  local: LocalDb,
  businessId: string,
  brandId: string | null | undefined,
): Promise<void> {
  if (brandId == null) return;
  const [row] = await local.db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.businessId, businessId)))
    .limit(1);
  if (!row) throw codedError('Brand not found', 'BRAND_NOT_FOUND');
}

async function assertWarrantyInBusiness(
  local: LocalDb,
  businessId: string,
  warrantyId: string | null | undefined,
): Promise<void> {
  if (warrantyId == null) return;
  const [row] = await local.db
    .select({ id: warranties.id })
    .from(warranties)
    .where(and(eq(warranties.id, warrantyId), eq(warranties.businessId, businessId)))
    .limit(1);
  if (!row) throw codedError('Warranty not found', 'WARRANTY_NOT_FOUND');
}

export async function createProduct(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
): Promise<{ id: string }> {
  requirePermission(new Set(grants), 'products.manage');
  const input = productCreateSchema.parse(raw);
  await assertCategoryInBusiness(local, businessId, input.categoryId);
  await assertBrandInBusiness(local, businessId, input.brandId);
  await assertWarrantyInBusiness(local, businessId, input.warrantyId);
  await assertTaxCategoryInBusiness(local, businessId, input.taxCategoryId);
  await assertUniqueCode(local, businessId, 'sku', input.sku);
  await assertUniqueCode(local, businessId, 'barcode', input.barcode);
  const locationId = await resolveLocationId(local, businessId, input.locationId);

  const timestamp = new Date();
  const id = newId('prd');
  const seed = local.raw.transaction(() => {
    local.db.insert(products).values({
      id,
      businessId,
      name: input.name.trim(),
      sku: input.sku,
      barcode: input.barcode,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      warrantyId: input.warrantyId ?? null,
      unit: input.unit,
      costPriceKobo: input.costPriceKobo,
      sellingPriceKobo: input.sellingPriceKobo,
      reorderLevel: input.reorderLevel,
      imagePath: input.imagePath,
      taxCategoryId: input.taxCategoryId ?? null,
      trackBatches: input.trackBatches ? 1 : 0,
      nearExpiryDays: input.nearExpiryDays,
      isActive: 1,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    if (input.openingStock > 0) {
      // Batch-tracked products put their opening stock in one batch carrying the
      // pack dates, so expiry alerts have something to count down from.
      const batchId = input.trackBatches
        ? ensureBatch(
            local,
            businessId,
            id,
            locationId,
            `OPEN-${timestamp.toISOString().slice(0, 10)}`,
            input.expiryDate ? new Date(input.expiryDate) : null,
            'Opening stock',
            input.manufacturedDate ? new Date(input.manufacturedDate) : null,
          )
        : null;
      local.db.insert(stockMovements).values({
        id: newId('mov'),
        businessId,
        productId: id,
        locationId,
        kind: 'opening',
        qtyDelta: input.openingStock,
        qtyAfter: input.openingStock,
        reason: 'Opening stock',
        batchId,
        userId,
        version: 1,
        createdAt: timestamp,
      }).run();
    }
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'product.create',
      entity: 'product',
      entityId: id,
      details: { name: input.name.trim(), openingStock: input.openingStock, locationId },
    });
  });
  seed();
  return { id };
}

export async function updateProduct(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  productId: string,
  raw: unknown,
): Promise<void> {
  requirePermission(new Set(grants), 'products.manage');
  const input = productUpdateSchema.parse(raw);
  const existing = await getProductRow(local, businessId, productId);
  if (!existing) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  if (input.categoryId !== undefined) {
    await assertCategoryInBusiness(local, businessId, input.categoryId);
  }
  if (input.brandId !== undefined) {
    await assertBrandInBusiness(local, businessId, input.brandId);
  }
  if (input.warrantyId !== undefined) {
    await assertWarrantyInBusiness(local, businessId, input.warrantyId);
  }
  if (input.taxCategoryId !== undefined) {
    await assertTaxCategoryInBusiness(local, businessId, input.taxCategoryId);
  }
  if (input.sku !== undefined) await assertUniqueCode(local, businessId, 'sku', input.sku, productId);
  if (input.barcode !== undefined) {
    await assertUniqueCode(local, businessId, 'barcode', input.barcode, productId);
  }

  const patch = {
    updatedAt: new Date(),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.sku !== undefined ? { sku: input.sku } : {}),
    ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
    ...(input.brandId !== undefined ? { brandId: input.brandId ?? null } : {}),
    ...(input.warrantyId !== undefined ? { warrantyId: input.warrantyId ?? null } : {}),
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.costPriceKobo !== undefined ? { costPriceKobo: input.costPriceKobo } : {}),
    ...(input.sellingPriceKobo !== undefined ? { sellingPriceKobo: input.sellingPriceKobo } : {}),
    ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
    ...(input.imagePath !== undefined ? { imagePath: input.imagePath } : {}),
    ...(input.taxCategoryId !== undefined ? { taxCategoryId: input.taxCategoryId ?? null } : {}),
    ...(input.trackBatches !== undefined ? { trackBatches: input.trackBatches ? 1 : 0 } : {}),
    ...(input.nearExpiryDays !== undefined ? { nearExpiryDays: input.nearExpiryDays } : {}),
  };

  const apply = local.raw.transaction(() => {
    local.db.update(products).set(patch).where(eq(products.id, productId)).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'product.update',
      entity: 'product',
      entityId: productId,
      details: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt' && k !== 'version') },
    });
  });
  apply();
}

async function setProductActive(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  productId: string,
  active: boolean,
): Promise<void> {
  requirePermission(new Set(grants), 'products.manage');
  const existing = await getProductRow(local, businessId, productId);
  if (!existing) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  const apply = local.raw.transaction(() => {
    local.db
      .update(products)
      .set({ isActive: active ? 1 : 0, updatedAt: new Date() })
      .where(eq(products.id, productId)).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: active ? 'product.restore' : 'product.archive',
      entity: 'product',
      entityId: productId,
      details: {},
    });
  });
  apply();
}

export function archiveProduct(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  productId: string,
): Promise<void> {
  return setProductActive(local, businessId, userId, grants, productId, false);
}

export function restoreProduct(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  productId: string,
): Promise<void> {
  return setProductActive(local, businessId, userId, grants, productId, true);
}

// --- stock levels ------------------------------------------------------------

export interface StockLevel {
  productId: string;
  productName: string;
  sku: string | null;
  reorderLevel: number;
  locationId: string;
  locationName: string;
  onHand: number;
  low: boolean;
}

export async function getLevels(
  local: LocalDb,
  businessId: string,
  rawQuery: unknown,
): Promise<{ items: StockLevel[]; total: number }> {
  const q = levelsQuerySchema.parse(rawQuery);
  const params: Array<string | number> = [businessId, businessId];
  let where = 'p.business_id = ? AND l.business_id = ? AND p.is_active = 1';
  if (q.locationId) {
    where += ' AND l.id = ?';
    params.push(q.locationId);
  }
  if (q.search) {
    where += ` AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.barcode LIKE ? ESCAPE '\\')`;
    const pattern = `%${escLike(q.search)}%`;
    params.push(pattern, pattern, pattern);
  }
  // HAVING must repeat the aggregate expression, not the `onHand` SELECT
  // alias: the alias is only defined in the outer rows query, while this
  // fragment is also embedded in the COUNT subquery below.
  const having = q.lowOnly ? 'HAVING COALESCE(SUM(m.qty_delta), 0) <= p.reorder_level' : '';
  const base = `FROM products p CROSS JOIN locations l LEFT JOIN stock_movements m ON m.product_id = p.id AND m.location_id = l.id AND m.business_id = p.business_id WHERE ${where} GROUP BY p.id, l.id ${having}`;

  const totalRow = local.raw.prepare(`SELECT COUNT(*) AS n FROM (SELECT p.id ${base})`).get(...params) as {
    n: number;
  };
  const rows = local.raw
    .prepare(
      `SELECT p.id AS productId, p.name AS productName, p.sku AS sku, p.reorder_level AS reorderLevel, l.id AS locationId, l.name AS locationName, COALESCE(SUM(m.qty_delta), 0) AS onHand ${base} ORDER BY p.name ASC, l.name ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Array<{
    productId: string;
    productName: string;
    sku: string | null;
    reorderLevel: number;
    locationId: string;
    locationName: string;
    onHand: number;
  }>;
  return {
    items: rows.map((r) => ({ ...r, low: r.onHand <= r.reorderLevel })),
    total: totalRow.n,
  };
}

// --- movements (append-only writes) ------------------------------------------

export interface MovementView {
  id: string;
  kind: string;
  qtyDelta: number;
  qtyAfter: number;
  reason: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string | null;
  locationId: string;
  locationName: string;
  userName: string | null;
}

export async function adjustStock(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
): Promise<{ movementId: string; qtyAfter: number }> {
  requirePermission(new Set(grants), 'inventory.adjust');
  const input = stockAdjustSchema.parse(raw);
  const product = await getProductRow(local, businessId, input.productId);
  if (!product) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  if (product.isActive !== 1) throw codedError('Product is archived', 'PRODUCT_ARCHIVED');
  const locationId = await resolveLocationId(local, businessId, input.locationId);

  const timestamp = new Date();
  const movementId = newId('mov');
  let qtyAfter = 0;
  const apply = local.raw.transaction(() => {
    const current = onHandSum(local, businessId, product.id, locationId);
    const next = current + input.quantityDelta;
    if (next < 0) {
      throw codedError(
        `Adjustment would take stock below zero (on hand: ${current}, change: ${input.quantityDelta})`,
        'NEGATIVE_STOCK',
      );
    }
    qtyAfter = next;
    local.db.insert(stockMovements).values({
      id: movementId,
      businessId,
      productId: product.id,
      locationId,
      kind: 'adjust',
      qtyDelta: input.quantityDelta,
      qtyAfter: next,
      reason: input.reason.trim(),
      userId,
      version: 1,
      createdAt: timestamp,
    }).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'stock.adjust',
      entity: 'stock_movement',
      entityId: movementId,
      details: { productId: product.id, locationId, delta: input.quantityDelta, qtyAfter: next },
    });
  });
  apply();
  return { movementId, qtyAfter };
}

export async function countStock(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
): Promise<{ movementId: string; qtyAfter: number; qtyDelta: number }> {
  requirePermission(new Set(grants), 'inventory.adjust');
  const input = stockCountSchema.parse(raw);
  const product = await getProductRow(local, businessId, input.productId);
  if (!product) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  if (product.isActive !== 1) throw codedError('Product is archived', 'PRODUCT_ARCHIVED');
  const locationId = await resolveLocationId(local, businessId, input.locationId);

  const timestamp = new Date();
  const movementId = newId('mov');
  let qtyDelta = 0;
  const apply = local.raw.transaction(() => {
    const current = onHandSum(local, businessId, product.id, locationId);
    qtyDelta = input.countedQty - current;
    local.db.insert(stockMovements).values({
      id: movementId,
      businessId,
      productId: product.id,
      locationId,
      kind: 'count',
      qtyDelta,
      qtyAfter: input.countedQty,
      reason: input.reason.trim() || 'Stock count',
      userId,
      version: 1,
      createdAt: timestamp,
    }).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'stock.count',
      entity: 'stock_movement',
      entityId: movementId,
      details: { productId: product.id, locationId, previous: current, counted: input.countedQty },
    });
  });
  apply();
  return { movementId, qtyAfter: input.countedQty, qtyDelta };
}

export async function listMovements(
  local: LocalDb,
  businessId: string,
  rawQuery: unknown,
): Promise<{ items: MovementView[]; total: number }> {
  const q = movementsQuerySchema.parse(rawQuery);
  const params: Array<string | number> = [businessId];
  let where = 'm.business_id = ?';
  if (q.productId) {
    where += ' AND m.product_id = ?';
    params.push(q.productId);
  }
  if (q.locationId) {
    where += ' AND m.location_id = ?';
    params.push(q.locationId);
  }
  const from = `FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN locations l ON l.id = m.location_id LEFT JOIN users u ON u.id = m.user_id WHERE ${where}`;
  const totalRow = local.raw.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params) as { n: number };
  const rows = local.raw
    .prepare(
      `SELECT m.id AS id, m.kind AS kind, m.qty_delta AS qtyDelta, m.qty_after AS qtyAfter, m.reason AS reason, m.created_at AS createdAtMs, p.id AS productId, p.name AS productName, p.sku AS sku, l.id AS locationId, l.name AS locationName, u.name AS userName ${from} ORDER BY m.created_at DESC, m.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Array<{
    id: string;
    kind: string;
    qtyDelta: number;
    qtyAfter: number;
    reason: string;
    createdAtMs: number;
    productId: string;
    productName: string;
    sku: string | null;
    locationId: string;
    locationName: string;
    userName: string | null;
  }>;
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      qtyDelta: r.qtyDelta,
      qtyAfter: r.qtyAfter,
      reason: r.reason,
      createdAt: new Date(r.createdAtMs).toISOString(),
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      locationId: r.locationId,
      locationName: r.locationName,
      userName: r.userName,
    })),
    total: totalRow.n,
  };
}
