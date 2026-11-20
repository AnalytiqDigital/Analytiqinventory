// Batch 15: wholesale price tiers and customer price lists.
//
// A tier holds an override price per product. Customers can be assigned a tier;
// a sale for that customer uses the tier price whenever the cashier did not
// type a price manually. Products without an override use their normal selling
// price, so a new tier starts as a copy of retail pricing.

import { priceTierSchema, priceTierUpdateSchema, tierPricesSchema } from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { customers, priceTiers, productPrices } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export interface PriceTierView {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  customerCount: number;
  priceCount: number;
}

export async function listPriceTiers(local: LocalDb, businessId: string): Promise<PriceTierView[]> {
  const rows = local.raw
    .prepare(
      `SELECT t.id AS id, t.name AS name, t.description AS description, t.is_default AS isDefault,
              (SELECT COUNT(*) FROM customers c WHERE c.price_tier_id = t.id AND c.is_active = 1) AS customerCount,
              (SELECT COUNT(*) FROM product_prices pp WHERE pp.price_tier_id = t.id) AS priceCount
         FROM price_tiers t
        WHERE t.business_id = ?
        ORDER BY t.is_default DESC, t.name ASC`
    )
    .all(businessId) as Array<{
    id: string;
    name: string;
    description: string;
    isDefault: number;
    customerCount: number;
    priceCount: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isDefault: r.isDefault === 1,
    customerCount: r.customerCount,
    priceCount: r.priceCount,
  }));
}

export async function createPriceTier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<PriceTierView> {
  requirePermission(new Set(grants), 'products.manage');
  const input = priceTierSchema.parse(raw);
  const name = input.name.trim();
  const [dup] = await local.db
    .select({ id: priceTiers.id })
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.name, name)))
    .limit(1)
    .all();
  if (dup) throw codedError(`A price list named "${name}" already exists`, 'TIER_EXISTS');

  const id = newId('tier');
  const timestamp = new Date();
  const write = local.raw.transaction(() => {
    if (input.isDefault) {
      local.db
        .update(priceTiers)
        .set({ isDefault: 0, updatedAt: timestamp })
        .where(eq(priceTiers.businessId, businessId))
        .run();
    }
    local.db
      .insert(priceTiers)
      .values({
        id,
        businessId,
        name,
        description: input.description,
        isDefault: input.isDefault ? 1 : 0,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'price_tier.create',
      entity: 'price_tier',
      entityId: id,
      details: { name },
    });
  });
  write();
  const tiers = await listPriceTiers(local, businessId);
  return tiers.find((t) => t.id === id)!;
}

export async function updatePriceTier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  tierId: string,
  raw: unknown
): Promise<void> {
  requirePermission(new Set(grants), 'products.manage');
  const input = priceTierUpdateSchema.parse(raw);
  const [tier] = await local.db
    .select()
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.id, tierId)))
    .limit(1)
    .all();
  if (!tier) throw codedError('Price list not found', 'TIER_NOT_FOUND');

  if (input.name !== undefined && input.name !== tier.name) {
    const [dup] = await local.db
      .select({ id: priceTiers.id })
      .from(priceTiers)
      .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.name, input.name)))
      .limit(1)
      .all();
    if (dup) throw codedError(`A price list named "${input.name}" already exists`, 'TIER_EXISTS');
  }

  const timestamp = new Date();
  const write = local.raw.transaction(() => {
    if (input.isDefault === true) {
      local.db
        .update(priceTiers)
        .set({ isDefault: 0, updatedAt: timestamp })
        .where(eq(priceTiers.businessId, businessId))
        .run();
    }
    local.db
      .update(priceTiers)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault ? 1 : 0 } : {}),
        updatedAt: timestamp,
      })
      .where(eq(priceTiers.id, tierId))
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'price_tier.update',
      entity: 'price_tier',
      entityId: tierId,
      details: input,
    });
  });
  write();
}

/** Delete is refused while customers still use the list. */
export async function deletePriceTier(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  tierId: string
): Promise<void> {
  requirePermission(new Set(grants), 'products.manage');
  const [tier] = await local.db
    .select({ id: priceTiers.id, name: priceTiers.name })
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.id, tierId)))
    .limit(1)
    .all();
  if (!tier) throw codedError('Price list not found', 'TIER_NOT_FOUND');
  const used = local.raw
    .prepare('SELECT COUNT(*) AS n FROM customers WHERE price_tier_id = ? AND is_active = 1')
    .get(tierId) as { n: number };
  if (used.n > 0) {
    throw codedError(
      `${used.n} customer${used.n === 1 ? '' : 's'} still use ${tier.name}; move them first`,
      'TIER_IN_USE'
    );
  }
  const write = local.raw.transaction(() => {
    local.db.delete(productPrices).where(eq(productPrices.priceTierId, tierId)).run();
    local.db.delete(priceTiers).where(eq(priceTiers.id, tierId)).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'price_tier.delete',
      entity: 'price_tier',
      entityId: tierId,
      details: { name: tier.name },
    });
  });
  write();
}

export interface TierPriceRow {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  sellingPriceKobo: number;
  tierPriceKobo: number | null;
}

/** Every active product with the tier override (null = uses retail price). */
export async function listTierPrices(
  local: LocalDb,
  businessId: string,
  tierId: string
): Promise<TierPriceRow[]> {
  const [tier] = await local.db
    .select({ id: priceTiers.id })
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.id, tierId)))
    .limit(1)
    .all();
  if (!tier) throw codedError('Price list not found', 'TIER_NOT_FOUND');

  const rows = local.raw
    .prepare(
      `SELECT p.id AS productId, p.name AS name, p.sku AS sku, p.unit AS unit,
              p.selling_price_kobo AS sellingPriceKobo, pp.price_kobo AS tierPriceKobo
         FROM products p
         LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_tier_id = ?
        WHERE p.business_id = ? AND p.is_active = 1
        ORDER BY p.name ASC`
    )
    .all(tierId, businessId) as Array<{
    productId: string;
    name: string;
    sku: string | null;
    unit: string;
    sellingPriceKobo: number;
    tierPriceKobo: number | null;
  }>;
  return rows;
}

/** Replace the tier's override prices. An empty list clears the tier. */
export async function setTierPrices(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  tierId: string,
  raw: unknown
): Promise<{ saved: number }> {
  requirePermission(new Set(grants), 'products.manage');
  const input = tierPricesSchema.parse(raw);
  const [tier] = await local.db
    .select({ id: priceTiers.id, name: priceTiers.name })
    .from(priceTiers)
    .where(and(eq(priceTiers.businessId, businessId), eq(priceTiers.id, tierId)))
    .limit(1)
    .all();
  if (!tier) throw codedError('Price list not found', 'TIER_NOT_FOUND');

  const ids = [...new Set(input.prices.map((p) => p.productId))];
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const found = local.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM products WHERE business_id = ? AND id IN (${placeholders})`
      )
      .get(businessId, ...ids) as { n: number };
    if (found.n !== ids.length) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  }

  const timestamp = new Date();
  const write = local.raw.transaction(() => {
    local.db.delete(productPrices).where(eq(productPrices.priceTierId, tierId)).run();
    for (const row of input.prices) {
      local.db
        .insert(productPrices)
        .values({
          id: newId('ppr'),
          businessId,
          productId: row.productId,
          priceTierId: tierId,
          priceKobo: row.priceKobo,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
    }
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'price_tier.prices',
      entity: 'price_tier',
      entityId: tierId,
      details: { name: tier.name, prices: input.prices.length },
    });
  });
  write();
  return { saved: input.prices.length };
}

/** Tier prices for a customer, keyed by product id. Empty when no tier. */
export function tierPriceMap(
  local: LocalDb,
  businessId: string,
  tierId: string | null
): Map<string, number> {
  const map = new Map<string, number>();
  if (!tierId) return map;
  const rows = local.raw
    .prepare(
      `SELECT pp.product_id AS productId, pp.price_kobo AS priceKobo
         FROM product_prices pp
        WHERE pp.business_id = ? AND pp.price_tier_id = ?`
    )
    .all(businessId, tierId) as Array<{ productId: string; priceKobo: number }>;
  for (const row of rows) map.set(row.productId, row.priceKobo);
  return map;
}

export async function customerPriceTier(
  local: LocalDb,
  businessId: string,
  customerId: string
): Promise<string | null> {
  const [row] = await local.db
    .select({ priceTierId: customers.priceTierId })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .limit(1)
    .all();
  return row?.priceTierId ?? null;
}
