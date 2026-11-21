// Batch 15: stock transfers between branches.
//
// A transfer writes two ledger rows per line - `transfer_out` at the sending
// location and `transfer_in` at the receiving one - inside a single
// transaction. Stock is therefore still only ever derived from
// stock_movements, and the central ledger sees both sides.
//
// Batched products keep their batch identity: the destination gets a batch
// row with the same batch number and expiry, so FIFO selling and expiry
// alerts continue to work after a transfer.

import { transferCreateSchema, transfersQuerySchema } from '@analytiq/validation';
import { eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { locations, stockMovements, stockTransferItems, stockTransfers } from './schema';
import { ensureBatch } from './batches';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function onHand(local: LocalDb, businessId: string, productId: string, locationId: string): number {
  const row = local.raw
    .prepare(
      'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
    )
    .get(businessId, productId, locationId) as { qty: number };
  return row.qty;
}

function nextReference(local: LocalDb, businessId: string): string {
  const rows = local.raw
    .prepare(
      `SELECT reference FROM stock_transfers WHERE business_id = ? AND reference LIKE 'TRF-%'`
    )
    .all(businessId) as Array<{ reference: string }>;
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.reference.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `TRF-${String(max + 1).padStart(6, '0')}`;
}

export interface TransferItemView {
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
}

export interface TransferView {
  id: string;
  reference: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  note: string;
  createdAt: string;
  items: TransferItemView[];
}

export async function createStockTransfer(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; reference: string }> {
  requirePermission(new Set(grants), 'inventory.adjust');
  const input = transferCreateSchema.parse(raw);
  if (input.fromLocationId === input.toLocationId) {
    throw codedError('Choose two different branches', 'TRANSFER_SAME_LOCATION');
  }

  const locRows = await local.db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.businessId, businessId))
    .all();
  const locMap = new Map(locRows.map((l) => [l.id, l.name]));
  if (!locMap.has(input.fromLocationId))
    throw codedError('Sending branch not found', 'LOCATION_NOT_FOUND');
  if (!locMap.has(input.toLocationId))
    throw codedError('Receiving branch not found', 'LOCATION_NOT_FOUND');

  // Aggregate duplicate product lines, then validate stock and product rows.
  const wanted = new Map<string, number>();
  for (const line of input.items) {
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }
  const ids = [...wanted.keys()];
  const placeholders = ids.map(() => '?').join(',');
  const prodRows = local.raw
    .prepare(
      `SELECT id, name, track_batches AS trackBatches, is_active AS isActive
         FROM products WHERE business_id = ? AND id IN (${placeholders})`
    )
    .all(businessId, ...ids) as Array<{
    id: string;
    name: string;
    trackBatches: number;
    isActive: number;
  }>;
  const prodMap = new Map(prodRows.map((p) => [p.id, p]));
  for (const [productId, qty] of wanted) {
    const product = prodMap.get(productId);
    if (!product) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
    if (product.isActive !== 1) throw codedError(`${product.name} is archived`, 'PRODUCT_ARCHIVED');
    const available = onHand(local, businessId, productId, input.fromLocationId);
    if (qty > available) {
      throw codedError(
        `Not enough ${product.name} at ${locMap.get(input.fromLocationId)} (have ${available}, need ${qty})`,
        'NEGATIVE_STOCK'
      );
    }
  }

  const id = newId('trf');
  const timestamp = new Date();
  let reference = '';
  const apply = local.raw.transaction(() => {
    reference = nextReference(local, businessId);
    local.db
      .insert(stockTransfers)
      .values({
        id,
        businessId,
        reference,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        note: input.note,
        createdBy: userId,
        createdAt: timestamp,
      })
      .run();

    for (const [productId, qty] of wanted) {
      local.db
        .insert(stockTransferItems)
        .values({ id: newId('tri'), transferId: id, productId, qty })
        .run();

      const product = prodMap.get(productId)!;
      let fromRunning = onHand(local, businessId, productId, input.fromLocationId);
      let toRunning = onHand(local, businessId, productId, input.toLocationId);
      let left = qty;

      if (product.trackBatches === 1) {
        const batches = local.raw
          .prepare(
            `SELECT pb.id AS id, pb.batch_no AS batchNo, pb.expiry_date AS expiryMs,
                    (SELECT COALESCE(SUM(m.qty_delta), 0) FROM stock_movements m WHERE m.batch_id = pb.id) AS remaining
               FROM product_batches pb
              WHERE pb.business_id = ? AND pb.product_id = ? AND pb.location_id = ?
              ORDER BY (pb.expiry_date IS NULL), pb.expiry_date ASC, pb.created_at ASC`
          )
          .all(businessId, productId, input.fromLocationId) as Array<{
          id: string;
          batchNo: string;
          expiryMs: number | null;
          remaining: number;
        }>;
        for (const batch of batches) {
          if (left <= 0) break;
          const take = Math.min(left, batch.remaining);
          if (take <= 0) continue;
          fromRunning -= take;
          local.db
            .insert(stockMovements)
            .values({
              id: newId('mov'),
              businessId,
              productId,
              locationId: input.fromLocationId,
              kind: 'transfer_out',
              qtyDelta: -take,
              qtyAfter: fromRunning,
              reason: `Transfer ${reference} to ${locMap.get(input.toLocationId)}`,
              batchId: batch.id,
              userId,
              version: 1,
              createdAt: timestamp,
            })
            .run();
          const destBatch = ensureBatch(
            local,
            businessId,
            productId,
            input.toLocationId,
            batch.batchNo,
            batch.expiryMs ? new Date(batch.expiryMs * 1000) : null
          );
          toRunning += take;
          local.db
            .insert(stockMovements)
            .values({
              id: newId('mov'),
              businessId,
              productId,
              locationId: input.toLocationId,
              kind: 'transfer_in',
              qtyDelta: take,
              qtyAfter: toRunning,
              reason: `Transfer ${reference} from ${locMap.get(input.fromLocationId)}`,
              batchId: destBatch,
              userId,
              version: 1,
              createdAt: timestamp,
            })
            .run();
          left -= take;
        }
      }

      if (left > 0) {
        fromRunning -= left;
        toRunning += left;
        local.db
          .insert(stockMovements)
          .values({
            id: newId('mov'),
            businessId,
            productId,
            locationId: input.fromLocationId,
            kind: 'transfer_out',
            qtyDelta: -left,
            qtyAfter: fromRunning,
            reason: `Transfer ${reference} to ${locMap.get(input.toLocationId)}`,
            userId,
            version: 1,
            createdAt: timestamp,
          })
          .run();
        local.db
          .insert(stockMovements)
          .values({
            id: newId('mov'),
            businessId,
            productId,
            locationId: input.toLocationId,
            kind: 'transfer_in',
            qtyDelta: left,
            qtyAfter: toRunning,
            reason: `Transfer ${reference} from ${locMap.get(input.fromLocationId)}`,
            userId,
            version: 1,
            createdAt: timestamp,
          })
          .run();
      }
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'stock.transfer',
      entity: 'stock_transfer',
      entityId: id,
      details: {
        reference,
        from: input.fromLocationId,
        to: input.toLocationId,
        lines: wanted.size,
      },
    });
  });
  apply();
  return { id, reference };
}

export async function listStockTransfers(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: TransferView[]; total: number }> {
  const q = transfersQuerySchema.parse(raw ?? {});
  const totalRow = local.raw
    .prepare('SELECT COUNT(*) AS n FROM stock_transfers WHERE business_id = ?')
    .get(businessId) as { n: number };
  const rows = local.raw
    .prepare(
      `SELECT t.id AS id, t.reference AS reference, t.from_location_id AS fromLocationId,
              f.name AS fromLocationName, t.to_location_id AS toLocationId,
              d.name AS toLocationName, t.note AS note, t.created_at AS createdAtMs
         FROM stock_transfers t
         JOIN locations f ON f.id = t.from_location_id
         JOIN locations d ON d.id = t.to_location_id
        WHERE t.business_id = ?
        ORDER BY t.created_at DESC, t.rowid DESC
        LIMIT ? OFFSET ?`
    )
    .all(businessId, q.limit, q.offset) as Array<{
    id: string;
    reference: string;
    fromLocationId: string;
    fromLocationName: string;
    toLocationId: string;
    toLocationName: string;
    note: string;
    createdAtMs: number;
  }>;

  const items: TransferView[] = [];
  for (const row of rows) {
    const lines = local.raw
      .prepare(
        `SELECT ti.product_id AS productId, p.name AS productName, p.sku AS sku, ti.qty AS qty
           FROM stock_transfer_items ti
           JOIN products p ON p.id = ti.product_id
          WHERE ti.transfer_id = ?`
      )
      .all(row.id) as Array<{
      productId: string;
      productName: string;
      sku: string | null;
      qty: number;
    }>;
    items.push({
      id: row.id,
      reference: row.reference,
      fromLocationId: row.fromLocationId,
      fromLocationName: row.fromLocationName,
      toLocationId: row.toLocationId,
      toLocationName: row.toLocationName,
      note: row.note,
      createdAt: new Date(row.createdAtMs * 1000).toISOString(),
      items: lines,
    });
  }
  return { items, total: totalRow.n };
}
