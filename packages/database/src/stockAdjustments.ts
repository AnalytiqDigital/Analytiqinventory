// Batch 16: stock adjustment documents.
//
// An adjustment is a header + signed lines written in one transaction. Each
// line appends an `adjust` row to stock_movements (the only on-hand source of
// truth) and stores the movement id on the line so the document can be traced.
// Negative results are refused, same rule as the single-item adjust action.

import { stockAdjustmentCreateSchema, stockAdjustmentsQuerySchema } from '@analytiq/validation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { getDefaultLocationId } from './inventory';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import {
  locations,
  products,
  stockAdjustmentItems,
  stockAdjustments,
  stockMovements,
  users,
} from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function onHand(local: LocalDb, businessId: string, productId: string, locationId: string): number {
  const row = local.raw
    .prepare(
      `SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements
        WHERE business_id = ? AND product_id = ? AND location_id = ?`
    )
    .get(businessId, productId, locationId) as { qty: number } | undefined;
  return row?.qty ?? 0;
}

function nextReference(local: LocalDb, businessId: string): string {
  const rows = local.raw
    .prepare(`SELECT reference FROM stock_adjustments WHERE business_id = ? AND reference LIKE 'ADJ-%'`)
    .all(businessId) as Array<{ reference: string }>;
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.reference.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `ADJ-${String(max + 1).padStart(6, '0')}`;
}

export interface StockAdjustmentItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qtyDelta: number;
  note: string;
}

export interface StockAdjustmentView {
  id: string;
  reference: string;
  locationId: string;
  locationName: string;
  reason: string;
  note: string;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  items: StockAdjustmentItemView[];
}

export async function createStockAdjustment(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; reference: string }> {
  requirePermission(new Set(grants), 'inventory.adjust');
  const input = stockAdjustmentCreateSchema.parse(raw);

  let locationId = input.locationId ?? null;
  if (locationId) {
    const [loc] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.businessId, businessId)))
      .limit(1);
    if (!loc) throw codedError('Location not found', 'LOCATION_NOT_FOUND');
  } else {
    locationId = await getDefaultLocationId(local, businessId);
    if (!locationId) throw codedError('No location configured', 'LOCATION_NOT_FOUND');
  }

  for (const line of input.items) {
    const [prod] = await local.db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(and(eq(products.id, line.productId), eq(products.businessId, businessId)))
      .limit(1);
    if (!prod) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
    if (prod.isActive !== 1) throw codedError('Product is archived', 'PRODUCT_ARCHIVED');
  }

  const id = newId('adj');
  const timestamp = new Date();
  let reference = '';

  const write = local.raw.transaction(() => {
    reference = nextReference(local, businessId);
    local.db
      .insert(stockAdjustments)
      .values({
        id,
        businessId,
        locationId,
        reference,
        reason: input.reason,
        note: input.note,
        createdBy: userId,
        createdAt: timestamp,
      })
      .run();

    for (const line of input.items) {
      const current = onHand(local, businessId, line.productId, locationId);
      const next = current + line.qtyDelta;
      if (next < 0) {
        throw codedError(
          `Line for product ${line.productId} would take stock below zero (on hand: ${current})`,
          'NEGATIVE_STOCK'
        );
      }
      const movementId = newId('mov');
      local.db
        .insert(stockMovements)
        .values({
          id: movementId,
          businessId,
          productId: line.productId,
          locationId,
          kind: 'adjust',
          qtyDelta: line.qtyDelta,
          qtyAfter: next,
          reason: `Adjustment ${reference}: ${input.reason}`,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();
      local.db
        .insert(stockAdjustmentItems)
        .values({
          id: newId('adi'),
          adjustmentId: id,
          productId: line.productId,
          movementId,
          qtyDelta: line.qtyDelta,
          note: line.note,
        })
        .run();
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'stock.adjustment.create',
      entity: 'stock_adjustment',
      entityId: id,
      details: { reference, lines: input.items.length, locationId },
    });
  });
  write();

  return { id, reference };
}

export async function listStockAdjustments(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: StockAdjustmentView[]; total: number }> {
  const query = stockAdjustmentsQuerySchema.parse(raw ?? {});
  const rows = await local.db
    .select({
      adjustment: stockAdjustments,
      locationName: locations.name,
      userName: users.name,
    })
    .from(stockAdjustments)
    .leftJoin(locations, eq(locations.id, stockAdjustments.locationId))
    .leftJoin(users, eq(users.id, stockAdjustments.createdBy))
    .where(eq(stockAdjustments.businessId, businessId))
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const [countRow] = await local.db
    .select({ n: sql<number>`count(*)` })
    .from(stockAdjustments)
    .where(eq(stockAdjustments.businessId, businessId));

  const items: StockAdjustmentView[] = [];
  for (const r of rows) {
    const lines = await local.db
      .select({
        item: stockAdjustmentItems,
        productName: products.name,
        sku: products.sku,
      })
      .from(stockAdjustmentItems)
      .leftJoin(products, eq(products.id, stockAdjustmentItems.productId))
      .where(eq(stockAdjustmentItems.adjustmentId, r.adjustment.id));
    items.push({
      id: r.adjustment.id,
      reference: r.adjustment.reference,
      locationId: r.adjustment.locationId,
      locationName: r.locationName ?? '',
      reason: r.adjustment.reason,
      note: r.adjustment.note,
      createdBy: r.adjustment.createdBy ?? null,
      createdByName: r.userName ?? '',
      createdAt: r.adjustment.createdAt.toISOString(),
      items: lines.map((l) => ({
        id: l.item.id,
        productId: l.item.productId,
        productName: l.productName ?? '',
        sku: l.sku ?? null,
        qtyDelta: l.item.qtyDelta,
        note: l.item.note,
      })),
    });
  }

  return { items, total: countRow?.n ?? 0 };
}
