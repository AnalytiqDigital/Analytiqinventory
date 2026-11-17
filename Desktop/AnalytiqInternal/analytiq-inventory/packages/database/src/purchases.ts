// Batch 6: purchasing.
//
// LIFECYCLE: draft -> received (stock in) | cancelled.
// - Creating a purchase only records intent; it does NOT move stock.
// - Receiving is the one operation that touches stock: inside a single
//   transaction it appends a `purchase` row per line to stock_movements
//   (positive qty_delta) and refreshes the product's cost price to the
//   latest unit cost. Only a draft can be received, so double-receiving
//   is impossible.
// - Cancelling only works from draft; a received purchase is reversed by
//   a stock adjustment, not by cancelling the record.
// - Purchase references are unique per business (PUR-000001, ...).

import { purchaseCreateSchema, purchasesQuerySchema } from '@analytiq/validation';
import { and, eq, like, sql } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { locations, products, purchaseItems, purchases, stockMovements, suppliers } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

async function defaultLocationId(local: LocalDb, businessId: string): Promise<string> {
  const [loc] = await local.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.businessId, businessId), eq(locations.isDefault, 1)))
    .limit(1);
  if (loc) return loc.id;
  const [any] = await local.db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.businessId, businessId))
    .limit(1);
  if (!any) throw codedError('No location configured', 'LOCATION_NOT_FOUND');
  return any.id;
}

function onHand(local: LocalDb, businessId: string, productId: string, locationId: string): number {
  const row = local.raw
    .prepare(
      `SELECT COALESCE(SUM(qty_delta), 0) AS v FROM stock_movements
    WHERE business_id = ? AND product_id = ? AND location_id = ?`
    )
    .get(businessId, productId, locationId) as { v: number } | undefined;
  return row?.v ?? 0;
}

/** Next sequential purchase reference for this business. */
function nextReference(local: LocalDb, businessId: string): string {
  const rows = local.raw
    .prepare(`SELECT reference FROM purchases WHERE business_id = ? AND reference LIKE 'PUR-%'`)
    .all(businessId) as Array<{ reference: string }>;
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.reference.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `PUR-${String(max + 1).padStart(6, '0')}`;
}

export interface PurchaseItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitCostKobo: number;
  lineTotalKobo: number;
}

export interface PurchaseView {
  id: string;
  reference: string;
  status: string;
  supplierId: string | null;
  supplierName: string | null;
  locationId: string;
  locationName: string;
  subtotalKobo: number;
  taxKobo: number;
  totalKobo: number;
  amountPaidKobo: number;
  note: string;
  receivedAt: string | null;
  receivedByName: string | null;
  createdAt: string;
  items: PurchaseItemView[];
}

export async function createPurchase(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; reference: string }> {
  requirePermission(new Set(grants), 'purchases.manage');
  const input = purchaseCreateSchema.parse(raw);
  const locationId = input.locationId ?? (await defaultLocationId(local, businessId));

  const [loc] = await local.db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.businessId, businessId), eq(locations.id, locationId)))
    .limit(1);
  if (!loc) throw codedError('Location not found in this business', 'LOCATION_NOT_FOUND');

  if (input.supplierId) {
    const [sup] = await local.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.businessId, businessId), eq(suppliers.id, input.supplierId)))
      .limit(1);
    if (!sup) throw codedError('Supplier not found in this business', 'SUPPLIER_NOT_FOUND');
  }

  // Every product must belong to this business before we record the line.
  for (const line of input.items) {
    const [prod] = await local.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.businessId, businessId), eq(products.id, line.productId)))
      .limit(1);
    if (!prod) throw codedError('Product not found in this business', 'PRODUCT_NOT_FOUND');
  }

  const id = newId('pur');
  const timestamp = new Date();
  let reference = input.reference.trim();
  const subtotal = input.items.reduce((sum, l) => sum + l.qty * l.unitCostKobo, 0);
  const total = subtotal + input.taxKobo;

  const write = local.raw.transaction(() => {
    if (!reference) reference = nextReference(local, businessId);
    local.db
      .insert(purchases)
      .values({
        id,
        businessId,
        locationId,
        supplierId: input.supplierId ?? null,
        reference,
        status: 'draft',
        subtotalKobo: subtotal,
        taxKobo: input.taxKobo,
        totalKobo: total,
        amountPaidKobo: input.amountPaidKobo,
        note: input.note,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    for (const line of input.items) {
      local.db
        .insert(purchaseItems)
        .values({
          id: newId('pui'),
          purchaseId: id,
          productId: line.productId,
          qty: line.qty,
          unitCostKobo: line.unitCostKobo,
          lineTotalKobo: line.qty * line.unitCostKobo,
        })
        .run();
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'purchase.create',
      entity: 'purchase',
      entityId: id,
      details: { reference, totalKobo: total, lines: input.items.length },
    });
  });
  write();
  return { id, reference };
}

/** Receive a draft purchase: stock in, cost price refreshed. Atomic. */
export async function receivePurchase(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  purchaseId: string
): Promise<{ stockLines: number }> {
  requirePermission(new Set(grants), 'purchases.manage');

  const [purchase] = await local.db
    .select()
    .from(purchases)
    .where(and(eq(purchases.businessId, businessId), eq(purchases.id, purchaseId)))
    .limit(1);
  if (!purchase) throw codedError('Purchase not found', 'PURCHASE_NOT_FOUND');
  if (purchase.status === 'received') {
    throw codedError('This purchase has already been received', 'PURCHASE_ALREADY_RECEIVED');
  }
  if (purchase.status === 'cancelled') {
    throw codedError('This purchase was cancelled', 'PURCHASE_CANCELLED');
  }

  const lines = await local.db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId));
  if (lines.length === 0) throw codedError('Purchase has no items', 'PURCHASE_EMPTY');

  const timestamp = new Date();
  const receive = local.raw.transaction(() => {
    for (const line of lines) {
      const after = onHand(local, businessId, line.productId, purchase.locationId) + line.qty;
      local.db
        .insert(stockMovements)
        .values({
          id: newId('mov'),
          businessId,
          productId: line.productId,
          locationId: purchase.locationId,
          kind: 'purchase',
          qtyDelta: line.qty,
          qtyAfter: after,
          reason: `Purchase ${purchase.reference}`,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();

      // Most recent purchase cost becomes the product's cost price.
      local.db
        .update(products)
        .set({ costPriceKobo: line.unitCostKobo, updatedAt: timestamp })
        .where(eq(products.id, line.productId))
        .run();
    }

    local.db
      .update(purchases)
      .set({ status: 'received', receivedBy: userId, receivedAt: timestamp, updatedAt: timestamp })
      .where(eq(purchases.id, purchaseId))
      .run();

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'purchase.receive',
      entity: 'purchase',
      entityId: purchaseId,
      details: { reference: purchase.reference, lines: lines.length },
    });
  });
  receive();

  return { stockLines: lines.length };
}

export async function cancelPurchase(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  purchaseId: string
): Promise<void> {
  requirePermission(new Set(grants), 'purchases.manage');

  const [purchase] = await local.db
    .select()
    .from(purchases)
    .where(and(eq(purchases.businessId, businessId), eq(purchases.id, purchaseId)))
    .limit(1);
  if (!purchase) throw codedError('Purchase not found', 'PURCHASE_NOT_FOUND');
  if (purchase.status === 'received') {
    throw codedError(
      'Received purchases cannot be cancelled; adjust stock instead',
      'PURCHASE_ALREADY_RECEIVED'
    );
  }
  if (purchase.status === 'cancelled') {
    throw codedError('This purchase is already cancelled', 'PURCHASE_ALREADY_CANCELLED');
  }

  local.db
    .update(purchases)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(purchases.id, purchaseId))
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'purchase.cancel',
    entity: 'purchase',
    entityId: purchaseId,
    details: { reference: purchase.reference },
  });
}

export async function listPurchases(
  local: LocalDb,
  businessId: string,
  raw: unknown
): Promise<{ items: PurchaseView[]; total: number }> {
  const query = purchasesQuerySchema.parse(raw ?? {});
  const clauses = [eq(purchases.businessId, businessId)];
  if (query.status) clauses.push(eq(purchases.status, query.status));
  if (query.supplierId) clauses.push(eq(purchases.supplierId, query.supplierId));
  if (query.search) {
    const term = `%${escLike(query.search)}%`;
    const match = like(purchases.reference, term);
    if (match) clauses.push(match);
  }
  const where = and(...clauses);

  const rows = await local.db
    .select({
      purchase: purchases,
      supplierName: suppliers.name,
      locationName: locations.name,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(locations, eq(locations.id, purchases.locationId))
    .where(where)
    .orderBy(sql`${purchases.createdAt} DESC`)
    .limit(query.limit)
    .offset(query.offset);

  const [countRow] = await local.db
    .select({ n: sql<number>`count(*)` })
    .from(purchases)
    .where(where);

  const items: PurchaseView[] = [];
  for (const r of rows) {
    const lines = await local.db
      .select({
        item: purchaseItems,
        productName: products.name,
        sku: products.sku,
      })
      .from(purchaseItems)
      .leftJoin(products, eq(products.id, purchaseItems.productId))
      .where(eq(purchaseItems.purchaseId, r.purchase.id));

    items.push({
      id: r.purchase.id,
      reference: r.purchase.reference,
      status: r.purchase.status,
      supplierId: r.purchase.supplierId,
      supplierName: r.supplierName ?? null,
      locationId: r.purchase.locationId,
      locationName: r.locationName ?? '',
      subtotalKobo: r.purchase.subtotalKobo,
      taxKobo: r.purchase.taxKobo,
      totalKobo: r.purchase.totalKobo,
      amountPaidKobo: r.purchase.amountPaidKobo,
      note: r.purchase.note,
      receivedAt: r.purchase.receivedAt ? r.purchase.receivedAt.toISOString() : null,
      receivedByName: null,
      createdAt: r.purchase.createdAt.toISOString(),
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
