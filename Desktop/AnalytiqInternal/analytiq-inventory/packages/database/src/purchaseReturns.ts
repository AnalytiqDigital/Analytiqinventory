// Batch 16: purchase returns.
//
// A return is always against a received purchase. Quantities are capped at
// what was purchased minus what has already come back, stock is taken out of
// the purchase's location (negative refused), and the movement keeps the batch
// when the product was received with one. Supplier payable is derived as
// purchases minus payments minus returns, never stored.

import { purchaseReturnCreateSchema, purchaseReturnsQuerySchema } from '@analytiq/validation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { newId } from './auth';
import { batchRemaining } from './batches';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import {
  products,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  stockMovements,
  suppliers,
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
    .prepare(`SELECT reference FROM purchase_returns WHERE business_id = ? AND reference LIKE 'PRT-%'`)
    .all(businessId) as Array<{ reference: string }>;
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.reference.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `PRT-${String(max + 1).padStart(6, '0')}`;
}

interface PurchaseLine {
  productId: string;
  qty: number;
  unitCostKobo: number;
  batchNo: string;
  expiryDate: Date | null;
}

export interface PurchaseReturnItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitCostKobo: number;
  lineTotalKobo: number;
}

export interface PurchaseReturnView {
  id: string;
  reference: string;
  purchaseId: string;
  purchaseReference: string;
  supplierName: string | null;
  reason: string;
  note: string;
  totalKobo: number;
  createdByName: string;
  createdAt: string;
  items: PurchaseReturnItemView[];
}

export async function createPurchaseReturn(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; reference: string; totalKobo: number }> {
  requirePermission(new Set(grants), 'purchases.manage');
  const input = purchaseReturnCreateSchema.parse(raw);

  const [purchase] = await local.db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, input.purchaseId), eq(purchases.businessId, businessId)))
    .limit(1);
  if (!purchase) throw codedError('Purchase not found', 'PURCHASE_NOT_FOUND');
  if (purchase.status !== 'received') {
    throw codedError('Only received purchases can be returned', 'PURCHASE_NOT_RECEIVED');
  }

  const lines = (await local.db
    .select({
      productId: purchaseItems.productId,
      qty: purchaseItems.qty,
      unitCostKobo: purchaseItems.unitCostKobo,
      batchNo: purchaseItems.batchNo,
      expiryDate: purchaseItems.expiryDate,
    })
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchase.id))) as PurchaseLine[];

  const purchased = new Map<string, { qty: number; value: number; batchNo: string; expiry: Date | null }>();
  for (const line of lines) {
    const entry = purchased.get(line.productId) ?? {
      qty: 0,
      value: 0,
      batchNo: line.batchNo,
      expiry: line.expiryDate,
    };
    entry.qty += line.qty;
    entry.value += line.qty * line.unitCostKobo;
    purchased.set(line.productId, entry);
  }

  const priorRows = local.raw
    .prepare(
      `SELECT product_id AS productId, COALESCE(SUM(qty), 0) AS qty
         FROM purchase_return_items ri
         JOIN purchase_returns r ON r.id = ri.return_id
        WHERE r.business_id = ? AND r.purchase_id = ?
        GROUP BY product_id`
    )
    .all(businessId, purchase.id) as Array<{ productId: string; qty: number }>;
  const prior = new Map(priorRows.map((r) => [r.productId, r.qty]));

  const seen = new Set<string>();
  for (const line of input.items) {
    if (seen.has(line.productId)) {
      throw codedError('Each product can appear only once per return', 'DUPLICATE_LINE');
    }
    seen.add(line.productId);
    const bought = purchased.get(line.productId);
    if (!bought) throw codedError('Product was not on this purchase', 'PRODUCT_NOT_ON_PURCHASE');
    const already = prior.get(line.productId) ?? 0;
    const available = bought.qty - already;
    if (line.qty > available) {
      throw codedError(
        `Only ${available} of this product can still be returned`,
        'RETURN_QTY_EXCEEDED'
      );
    }
    const stock = onHand(local, businessId, line.productId, purchase.locationId);
    if (stock < line.qty) {
      throw codedError(
        `Not enough stock at this location to return ${line.qty} (on hand: ${stock})`,
        'NEGATIVE_STOCK'
      );
    }
  }

  const id = newId('prt');
  const timestamp = new Date();
  let reference = '';
  let totalKobo = 0;

  const write = local.raw.transaction(() => {
    reference = nextReference(local, businessId);
    totalKobo = input.items.reduce((sum, line) => {
      const bought = purchased.get(line.productId);
      const unitCost = bought ? Math.round(bought.value / bought.qty) : 0;
      return sum + unitCost * line.qty;
    }, 0);

    local.db
      .insert(purchaseReturns)
      .values({
        id,
        businessId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId ?? null,
        locationId: purchase.locationId,
        reference,
        reason: input.reason,
        note: input.note,
        totalKobo,
        createdBy: userId,
        createdAt: timestamp,
      })
      .run();

    for (const line of input.items) {
      const bought = purchased.get(line.productId);
      if (!bought) continue;
      const unitCost = Math.round(bought.value / bought.qty);
      const after = onHand(local, businessId, line.productId, purchase.locationId) - line.qty;
      if (after < 0) {
        throw codedError('Return would take stock below zero', 'NEGATIVE_STOCK');
      }

      let batchId: string | null = null;
      if (bought.batchNo.trim() !== '') {
        const row = local.raw
          .prepare(
            `SELECT id FROM product_batches
              WHERE business_id = ? AND product_id = ? AND location_id = ? AND batch_no = ?
              ORDER BY expiry_date IS NULL, expiry_date LIMIT 1`
          )
          .get(businessId, line.productId, purchase.locationId, bought.batchNo) as
          | { id: string }
          | undefined;
        if (row) {
          if (batchRemaining(local, businessId, row.id) < line.qty) {
            throw codedError('Not enough stock left in that batch', 'BATCH_EMPTY');
          }
          batchId = row.id;
        }
      }

      local.db
        .insert(stockMovements)
        .values({
          id: newId('mov'),
          businessId,
          productId: line.productId,
          locationId: purchase.locationId,
          kind: 'purchase_return',
          qtyDelta: -line.qty,
          qtyAfter: after,
          reason: `Purchase return ${reference}`,
          batchId,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();

      local.db
        .insert(purchaseReturnItems)
        .values({
          id: newId('pri'),
          returnId: id,
          productId: line.productId,
          qty: line.qty,
          unitCostKobo: unitCost,
          lineTotalKobo: unitCost * line.qty,
        })
        .run();
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'purchase.return.create',
      entity: 'purchase_return',
      entityId: id,
      details: { reference, purchaseReference: purchase.reference, totalKobo, lines: input.items.length },
    });
  });
  write();

  return { id, reference, totalKobo };
}

export async function listPurchaseReturns(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: PurchaseReturnView[]; total: number }> {
  const query = purchaseReturnsQuerySchema.parse(raw ?? {});
  const rows = await local.db
    .select({
      ret: purchaseReturns,
      purchaseReference: purchases.reference,
      supplierName: suppliers.name,
      createdByName: sql<string>`(SELECT name FROM users WHERE id = ${purchaseReturns.createdBy})`,
    })
    .from(purchaseReturns)
    .leftJoin(purchases, eq(purchases.id, purchaseReturns.purchaseId))
    .leftJoin(suppliers, eq(suppliers.id, purchaseReturns.supplierId))
    .where(eq(purchaseReturns.businessId, businessId))
    .orderBy(desc(purchaseReturns.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const [countRow] = await local.db
    .select({ n: sql<number>`count(*)` })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.businessId, businessId));

  const items: PurchaseReturnView[] = [];
  for (const r of rows) {
    const lines = await local.db
      .select({
        item: purchaseReturnItems,
        productName: products.name,
        sku: products.sku,
      })
      .from(purchaseReturnItems)
      .leftJoin(products, eq(products.id, purchaseReturnItems.productId))
      .where(eq(purchaseReturnItems.returnId, r.ret.id));
    items.push({
      id: r.ret.id,
      reference: r.ret.reference,
      purchaseId: r.ret.purchaseId,
      purchaseReference: r.purchaseReference ?? '',
      supplierName: r.supplierName ?? null,
      reason: r.ret.reason,
      note: r.ret.note,
      totalKobo: r.ret.totalKobo,
      createdByName: r.createdByName ?? '',
      createdAt: r.ret.createdAt.toISOString(),
      items: lines.map((l) => ({
        id: l.item.id,
        productId: l.item.productId,
        productName: l.productName ?? '',
        sku: l.sku ?? null,
        qty: l.item.qty,
        unitCostKobo: l.item.unitCostKobo,
        lineTotalKobo: l.item.lineTotalKobo,
      })),
    });
  }

  return { items, total: countRow?.n ?? 0 };
}
