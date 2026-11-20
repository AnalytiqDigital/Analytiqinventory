// Batch 15: batch + expiry tracking.
//
// Batch stock follows the same ledger rule as everything else: a batch's
// remaining quantity is SUM(qty_delta) over stock_movements rows carrying that
// batch_id. Receiving stock creates the batch row and a positive movement;
// sales consume batches first-expiry-first-out (see sales.ts).
//
// Products are opt-in (`products.track_batches`). Receiving a batch with a
// batch number or expiry date turns the flag on automatically, so a pharmacy
// can start using batches from the next delivery without a product edit.

import { batchIntakeSchema, batchesQuerySchema } from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { locations, productBatches, products, stockMovements } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function toDate(value: Date | null | undefined): Date | null {
  return value ?? null;
}

export interface BatchView {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  batchNo: string;
  expiryDate: string | null;
  locationId: string;
  locationName: string;
  remaining: number;
  onHand: number;
  nearExpiryDays: number;
  status: 'expired' | 'expiring' | 'ok' | 'empty';
}

export function batchRemaining(local: LocalDb, businessId: string, batchId: string): number {
  const row = local.raw
    .prepare(
      'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND batch_id = ?'
    )
    .get(businessId, batchId) as { qty: number };
  return row.qty;
}

function productOnHand(
  local: LocalDb,
  businessId: string,
  productId: string,
  locationId: string
): number {
  const row = local.raw
    .prepare(
      'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
    )
    .get(businessId, productId, locationId) as { qty: number };
  return row.qty;
}

export function batchStatus(
  expiry: Date | null,
  remaining: number,
  nearExpiryDays: number,
  now = new Date()
): BatchView['status'] {
  if (remaining <= 0) return 'empty';
  if (!expiry) return 'ok';
  const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= nearExpiryDays) return 'expiring';
  return 'ok';
}

/** Find the batch row for a delivery line, creating it if new. */
export function ensureBatch(
  local: LocalDb,
  businessId: string,
  productId: string,
  locationId: string,
  batchNo: string,
  expiryDate: Date | null,
  note = ''
): string {
  const cleanNo = batchNo.trim();
  const expiryKey = expiryDate ? expiryDate.getTime() : null;
  const rows = local.raw
    .prepare(
      `SELECT id, expiry_date AS expiryMs FROM product_batches
        WHERE business_id = ? AND product_id = ? AND location_id = ? AND batch_no = ?`
    )
    .all(businessId, productId, locationId, cleanNo) as Array<{
    id: string;
    expiryMs: number | null;
  }>;
  const existing = rows.find((r) => (r.expiryMs ?? null) === expiryKey);
  if (existing) return existing.id;

  const id = newId('bat');
  const timestamp = new Date();
  local.db
    .insert(productBatches)
    .values({
      id,
      businessId,
      productId,
      locationId,
      batchNo: cleanNo,
      expiryDate: expiryDate ?? null,
      note,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  return id;
}

/** Record stock received into a batch (delivery without a purchase order). */
export async function createBatchIntake(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ batchId: string; qtyAfter: number }> {
  requirePermission(new Set(grants), 'inventory.adjust');
  const input = batchIntakeSchema.parse(raw);

  const [product] = await local.db
    .select({
      id: products.id,
      name: products.name,
      isActive: products.isActive,
      trackBatches: products.trackBatches,
    })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.businessId, businessId)))
    .limit(1)
    .all();
  if (!product) throw codedError('Product not found', 'PRODUCT_NOT_FOUND');
  if (product.isActive !== 1) throw codedError('Product is archived', 'PRODUCT_ARCHIVED');

  let locationId = input.locationId ?? null;
  if (!locationId) {
    const [def] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.businessId, businessId), eq(locations.isDefault, 1)))
      .limit(1)
      .all();
    if (!def) throw codedError('No location configured', 'LOCATION_NOT_FOUND');
    locationId = def.id;
  } else {
    const [loc] = await local.db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.businessId, businessId), eq(locations.id, locationId)))
      .limit(1)
      .all();
    if (!loc) throw codedError('Location not found', 'LOCATION_NOT_FOUND');
  }

  const expiry = input.expiryDate ? new Date(input.expiryDate) : null;
  const timestamp = new Date();
  let batchId = '';
  let qtyAfter = 0;

  const apply = local.raw.transaction(() => {
    batchId = ensureBatch(
      local,
      businessId,
      product.id,
      locationId,
      input.batchNo || `B-${timestamp.toISOString().slice(0, 10)}`,
      expiry,
      input.note
    );
    qtyAfter = productOnHand(local, businessId, product.id, locationId) + input.qty;
    local.db
      .insert(stockMovements)
      .values({
        id: newId('mov'),
        businessId,
        productId: product.id,
        locationId,
        kind: 'purchase',
        qtyDelta: input.qty,
        qtyAfter,
        reason: `Batch intake${input.note ? `: ${input.note}` : ''}`,
        batchId,
        userId,
        version: 1,
        createdAt: timestamp,
      })
      .run();
    if (product.trackBatches !== 1) {
      local.db
        .update(products)
        .set({ trackBatches: 1, updatedAt: timestamp })
        .where(eq(products.id, product.id))
        .run();
    }
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'batch.intake',
      entity: 'product_batch',
      entityId: batchId,
      details: { productId: product.id, qty: input.qty, expiry: expiry?.toISOString() ?? null },
    });
  });
  apply();
  return { batchId, qtyAfter };
}

export async function listBatches(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: BatchView[]; total: number; expiringCount: number; expiredCount: number }> {
  const q = batchesQuerySchema.parse(raw ?? {});
  const params: Array<string | number> = [businessId];
  let where = 'pb.business_id = ?';
  if (q.productId) {
    where += ' AND pb.product_id = ?';
    params.push(q.productId);
  }
  if (q.locationId) {
    where += ' AND pb.location_id = ?';
    params.push(q.locationId);
  }
  if (q.search) {
    const pattern = `%${escLike(q.search)}%`;
    where += ` AND (p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR pb.batch_no LIKE ? ESCAPE '\\')`;
    params.push(pattern, pattern, pattern);
  }
  if (q.expiringDays != null) {
    const cutoff = Math.floor((Date.now() + q.expiringDays * 86_400_000) / 1000);
    where += ' AND pb.expiry_date IS NOT NULL AND pb.expiry_date <= ?';
    params.push(cutoff);
  }
  const remaining = `(SELECT COALESCE(SUM(m.qty_delta), 0) FROM stock_movements m WHERE m.batch_id = pb.id)`;
  if (!q.includeEmpty) where += ` AND ${remaining} > 0`;

  const from = `FROM product_batches pb JOIN products p ON p.id = pb.product_id JOIN locations l ON l.id = pb.location_id WHERE ${where}`;
  const totalRow = local.raw.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params) as { n: number };

  const rows = local.raw
    .prepare(
      `SELECT pb.id AS id, pb.product_id AS productId, p.name AS productName, p.sku AS sku,
              p.unit AS unit, p.near_expiry_days AS nearExpiryDays,
              pb.batch_no AS batchNo, pb.expiry_date AS expiryMs,
              pb.location_id AS locationId, l.name AS locationName,
              ${remaining} AS remaining,
              (SELECT COALESCE(SUM(m2.qty_delta), 0) FROM stock_movements m2
                WHERE m2.business_id = pb.business_id AND m2.product_id = pb.product_id
                  AND m2.location_id = pb.location_id) AS onHand
         ${from}
        ORDER BY (pb.expiry_date IS NULL), pb.expiry_date ASC, p.name ASC`
    )
    .all(...params) as Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    unit: string;
    nearExpiryDays: number;
    batchNo: string;
    expiryMs: number | null;
    locationId: string;
    locationName: string;
    remaining: number;
    onHand: number;
  }>;

  const now = new Date();
  const items: BatchView[] = rows.map((r) => {
    const expiry = r.expiryMs ? new Date(r.expiryMs * 1000) : null;
    return {
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      unit: r.unit,
      batchNo: r.batchNo,
      expiryDate: expiry ? expiry.toISOString() : null,
      locationId: r.locationId,
      locationName: r.locationName,
      remaining: r.remaining,
      onHand: r.onHand,
      nearExpiryDays: r.nearExpiryDays,
      status: batchStatus(expiry, r.remaining, r.nearExpiryDays, now),
    };
  });
  return {
    items: q.expiringDays != null ? items.slice(0, 200) : items.slice(0, 500),
    total: totalRow.n,
    expiringCount: items.filter((b) => b.status === 'expiring').length,
    expiredCount: items.filter((b) => b.status === 'expired').length,
  };
}

/** Batches that are expired or inside their product's alert window. */
export async function listExpiryAlerts(
  local: LocalDb,
  businessId: string,
  withinDays = 60
): Promise<BatchView[]> {
  const all = await listBatches(local, businessId, {
    expiringDays: withinDays,
    includeEmpty: false,
  });
  return all.items.filter((b) => b.status === 'expiring' || b.status === 'expired');
}

export function expiryDateOf(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export { toDate };
