// Batch 15: counter returns and exchanges.
//
// A return is a partial refund tied to a receipt: pick the receipt, pick the
// items and quantities, restock them, and record how the money went back.
// Sales that were already refunded/voided are refused, and a line can never be
// returned beyond the quantity sold (previous returns are subtracted).
//
// Exchange = record the return, then ring the replacement as a new sale. The
// return row is tagged `exchange` so reports can tell the two apart.

import { returnCreateSchema, returnsQuerySchema } from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { getSale, type SaleView } from './sales';
import { writeAuditSync } from './service';
import { postRefundSync } from './accounts';
import { locations, saleItems, saleReturnItems, saleReturns, sales, stockMovements } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function onHand(
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

/** Quantity already returned per sale_item, from earlier returns. */
export function returnedQtyByItem(local: LocalDb, saleId: string): Map<string, number> {
  const rows = local.raw
    .prepare(
      `SELECT ri.sale_item_id AS saleItemId, COALESCE(SUM(ri.qty), 0) AS qty
         FROM sale_return_items ri
         JOIN sale_returns r ON r.id = ri.return_id
        WHERE r.sale_id = ?
        GROUP BY ri.sale_item_id`
    )
    .all(saleId) as Array<{ saleItemId: string; qty: number }>;
  return new Map(rows.map((r) => [r.saleItemId, r.qty]));
}

/**
 * Restock one sale line, back into the batches the sale consumed. Prior
 * returns for this receipt are subtracted first, so repeated partial returns
 * cannot inflate a batch.
 */
function restockLine(
  local: LocalDb,
  businessId: string,
  userId: string,
  sale: { id: string; locationId: string; receiptNo: string },
  productId: string,
  qty: number,
  reason: string,
  timestamp: Date
): void {
  const consumed = local.raw
    .prepare(
      `SELECT batch_id AS batchId, SUM(-qty_delta) AS qty
         FROM stock_movements
        WHERE business_id = ? AND product_id = ? AND location_id = ?
          AND kind = 'sale' AND reason LIKE ? ESCAPE '\\'
        GROUP BY batch_id
        ORDER BY MIN(created_at) ASC`
    )
    .all(
      businessId,
      productId,
      sale.locationId,
      `Sale ${escLike(sale.receiptNo)}%`
    ) as Array<{
    batchId: string | null;
    qty: number;
  }>;

  const already = local.raw
    .prepare(
      `SELECT batch_id AS batchId, COALESCE(SUM(qty_delta), 0) AS qty
         FROM stock_movements
        WHERE business_id = ? AND product_id = ? AND location_id = ?
          AND kind = 'return' AND reason LIKE ? ESCAPE '\\'
        GROUP BY batch_id`
    )
    .all(businessId, productId, sale.locationId, `Return ${escLike(sale.receiptNo)}%`) as Array<{
    batchId: string | null;
    qty: number;
  }>;
  const returned = new Map<string, number>(
    already.map((r) => [r.batchId ?? '', r.qty])
  );

  let left = qty;
  let running = onHand(local, businessId, productId, sale.locationId);
  for (const row of consumed) {
    if (left <= 0) break;
    const key = row.batchId ?? '';
    const available = row.qty - (returned.get(key) ?? 0);
    if (available <= 0) continue;
    const take = Math.min(left, available);
    running += take;
    local.db
      .insert(stockMovements)
      .values({
        id: newId('mov'),
        businessId,
        productId,
        locationId: sale.locationId,
        kind: 'return',
        qtyDelta: take,
        qtyAfter: running,
        reason: `Return ${sale.receiptNo}: ${reason}`,
        batchId: row.batchId,
        userId,
        version: 1,
        createdAt: timestamp,
      })
      .run();
    left -= take;
  }

  // Imported or pre-batch sales have no `sale` rows to match; restock plainly.
  if (left > 0) {
    running += left;
    local.db
      .insert(stockMovements)
      .values({
        id: newId('mov'),
        businessId,
        productId,
        locationId: sale.locationId,
        kind: 'return',
        qtyDelta: left,
        qtyAfter: running,
        reason: `Return ${sale.receiptNo}: ${reason}`,
        userId,
        version: 1,
        createdAt: timestamp,
      })
      .run();
  }
}

export async function lookupSaleByReceipt(
  local: LocalDb,
  businessId: string,
  grants: string[],
  receiptNo: string
): Promise<SaleView> {
  requirePermission(new Set(grants), 'sales.view');
  const [row] = await local.db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.businessId, businessId), eq(sales.receiptNo, receiptNo.trim())))
    .limit(1)
    .all();
  if (!row) throw codedError('No sale with that receipt number', 'SALE_NOT_FOUND');
  return getSale(local, businessId, grants, row.id);
}

export interface CreateReturnResult {
  id: string;
  refundKobo: number;
  fullyReturned: boolean;
}

export async function createSaleReturn(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<CreateReturnResult> {
  requirePermission(new Set(grants), 'sales.refund');
  const input = returnCreateSchema.parse(raw);

  const [sale] = await local.db
    .select()
    .from(sales)
    .where(and(eq(sales.businessId, businessId), eq(sales.id, input.saleId)))
    .limit(1)
    .all();
  if (!sale) throw codedError('Sale not found', 'SALE_NOT_FOUND');
  if (sale.status !== 'completed') throw codedError('Sale is already reversed', 'ALREADY_REVERSED');

  const lines = await local.db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, input.saleId))
    .all();
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const returned = returnedQtyByItem(local, input.saleId);

  // Net base for spreading the sale-level discount across lines.
  const netBase = sale.subtotalKobo - sale.lineDiscountKobo - sale.headerDiscountKobo;

  let refundKobo = 0;
  const picked = input.items.map((pick) => {
    const line = lineMap.get(pick.saleItemId);
    if (!line) throw codedError('That item is not on this receipt', 'RETURN_ITEM_NOT_FOUND');
    const already = returned.get(line.id) ?? 0;
    const available = line.qty - already;
    if (pick.qty > available) {
      throw codedError(
        `Only ${available} left to return on that line (${already} already returned)`,
        'RETURN_QTY_EXCEEDED'
      );
    }
    const lineValue =
      netBase > 0
        ? Math.round((line.lineTotalKobo * sale.totalKobo) / netBase)
        : line.lineTotalKobo;
    const refund = Math.round((lineValue * pick.qty) / line.qty);
    refundKobo += refund;
    return { ...pick, productId: line.productId, refund, line };
  });

  // Refund can never exceed what is left of the sale.
  const previousRefund = local.raw
    .prepare('SELECT COALESCE(SUM(refund_kobo), 0) AS v FROM sale_returns WHERE sale_id = ?')
    .get(input.saleId) as { v: number };
  const remainingValue = sale.totalKobo - previousRefund.v;
  refundKobo = Math.min(refundKobo, remainingValue);

  const timestamp = new Date();
  const returnId = newId('ret');
  const reason = input.reason.trim();
  let fullyReturned = false;

  const apply = local.raw.transaction(() => {
    local.db
      .insert(saleReturns)
      .values({
        id: returnId,
        businessId,
        saleId: sale.id,
        locationId: sale.locationId,
        receiptNo: sale.receiptNo,
        kind: input.kind,
        reason,
        refundKobo,
        refundMethod: input.refundMethod,
        exchangeSaleId: null,
        createdBy: userId,
        createdAt: timestamp,
      })
      .run();

    for (const pick of picked) {
      local.db
        .insert(saleReturnItems)
        .values({
          id: newId('rin'),
          returnId,
          saleItemId: pick.saleItemId,
          productId: pick.productId,
          qty: pick.qty,
          refundKobo: pick.refund,
        })
        .run();
      restockLine(
        local,
        businessId,
        userId,
        sale,
        pick.productId,
        pick.qty,
        reason,
        timestamp
      );
    }

    // Fully returned once every line has come back in full.
    const freshReturned = returnedQtyByItem(local, input.saleId);
    fullyReturned = lines.every((line) => (freshReturned.get(line.id) ?? 0) >= line.qty);
    if (fullyReturned) {
      local.db
        .update(sales)
        .set({ status: 'refunded', updatedAt: timestamp, version: sale.version + 1 })
        .where(eq(sales.id, sale.id))
        .run();
    }

    // Money back to the account it came from (exchanges ring a new sale instead).
    if (input.kind === 'refund') {
      postRefundSync(local, businessId, {
        saleId: sale.id,
        returnId,
        receiptNo: sale.receiptNo,
        refundKobo,
        method: input.refundMethod,
        userId,
        createdAt: timestamp,
      });
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: input.kind === 'exchange' ? 'sale.exchange' : 'sale.return',
      entity: 'sale',
      entityId: sale.id,
      details: {
        returnId,
        receiptNo: sale.receiptNo,
        items: picked.length,
        refundKobo,
        method: input.refundMethod,
      },
    });
  });
  apply();

  return { id: returnId, refundKobo, fullyReturned };
}

export interface SaleReturnView {
  id: string;
  receiptNo: string;
  saleId: string;
  kind: string;
  reason: string;
  refundKobo: number;
  refundMethod: string;
  createdAt: string;
  userName: string | null;
  itemCount: number;
}

export async function listSaleReturns(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: SaleReturnView[]; total: number }> {
  const q = returnsQuerySchema.parse(raw ?? {});
  const params: Array<string | number> = [businessId];
  let where = 'r.business_id = ?';
  if (q.search) {
    where += ` AND r.receipt_no LIKE ? ESCAPE '\\'`;
    params.push(`%${escLike(q.search)}%`);
  }
  const from = `FROM sale_returns r LEFT JOIN users u ON u.id = r.created_by WHERE ${where}`;
  const totalRow = local.raw.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params) as { n: number };
  const rows = local.raw
    .prepare(
      `SELECT r.id AS id, r.receipt_no AS receiptNo, r.sale_id AS saleId, r.kind AS kind,
              r.reason AS reason, r.refund_kobo AS refundKobo, r.refund_method AS refundMethod,
              r.created_at AS createdAtMs, u.name AS userName,
              (SELECT COUNT(*) FROM sale_return_items ri WHERE ri.return_id = r.id) AS itemCount
         ${from}
        ORDER BY r.created_at DESC, r.rowid DESC LIMIT ? OFFSET ?`
    )
    .all(...params, q.limit, q.offset) as Array<{
    id: string;
    receiptNo: string;
    saleId: string;
    kind: string;
    reason: string;
    refundKobo: number;
    refundMethod: string;
    createdAtMs: number;
    userName: string | null;
    itemCount: number;
  }>;
  return {
    items: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      saleId: r.saleId,
      kind: r.kind,
      reason: r.reason,
      refundKobo: r.refundKobo,
      refundMethod: r.refundMethod,
      createdAt: new Date(r.createdAtMs * 1000).toISOString(),
      userName: r.userName,
      itemCount: r.itemCount,
    })),
    total: totalRow.n,
  };
}

export async function locationName(
  local: LocalDb,
  locationId: string
): Promise<string> {
  const [loc] = await local.db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1)
    .all();
  return loc?.name ?? '';
}
