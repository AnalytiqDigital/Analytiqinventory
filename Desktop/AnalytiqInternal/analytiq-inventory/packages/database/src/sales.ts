// Batch 5: POS + cash register.
//
// SALES RULES (locked):
// - A sale is one atomic transaction: header + items + payments + stock
//   ledger rows + audit. Partial writes never happen.
// - Stock decrements append `sale` rows to stock_movements (negative
//   qty_delta). Negative on-hand is rejected with NEGATIVE_STOCK.
// - Refunds/voids append offsetting `return` rows and a sale_reversals
//   record. Sales are never deleted.
// - Money in integer kobo. Line discounts per item, one header discount
//   per sale. Tax: explicit per-sale kobo, defaulting to the business
//   tax rate applied to (subtotal - discounts).
// - Payment methods: cash, transfer, pos, credit. Split tender allowed;
//   sum(payments) must cover total. Change = paid - total (cash overpay).
// - No customer records in Batch 5 (walk-in only); credit = pay-later
//   tracked on the sale, customer ledger arrives in Batch 6.

import {
  saleCreateSchema,
  saleRefundSchema,
  salesQuerySchema,
  type PaymentMethod,
} from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { getDefaultLocationId } from './inventory';
import { writeAuditSync } from './service';
import {
  businesses,
  locations,
  products,
  saleItems,
  salePayments,
  saleReversals,
  sales,
  diningTables,
  customers,
  stockMovements,
  users,
} from './schema';

export const SALE_STATUSES = ['completed', 'refunded', 'voided'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

/** What a customer currently owes: credit tenders minus money received. */
function creditOutstanding(local: LocalDb, businessId: string, customerId: string): number {
  const owed = local.raw
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_kobo), 0) AS v
 FROM sale_payments sp
 JOIN sales s ON s.id = sp.sale_id
 WHERE s.business_id = ? AND s.customer_id = ? AND s.status = 'completed'
 AND sp.method = 'credit'`
    )
    .get(businessId, customerId) as { v: number } | undefined;
  const paid = local.raw
    .prepare(
      `SELECT COALESCE(SUM(p.amount_kobo), 0) AS v FROM customer_payments p
 WHERE p.business_id = ? AND p.customer_id = ?`
    )
    .get(businessId, customerId) as { v: number } | undefined;
  return (owed?.v ?? 0) - (paid?.v ?? 0);
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface SaleItemView {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  qty: number;
  unitPriceKobo: number;
  lineDiscountKobo: number;
  lineTotalKobo: number;
}

export interface SalePaymentView {
  id: string;
  method: PaymentMethod;
  amountKobo: number;
  reference: string;
}

export interface SaleView {
  id: string;
  receiptNo: string;
  locationId: string;
  locationName: string;
  cashierId: string | null;
  cashierName: string | null;
  status: SaleStatus;
  subtotalKobo: number;
  lineDiscountKobo: number;
  headerDiscountKobo: number;
  taxKobo: number;
  totalKobo: number;
  amountPaidKobo: number;
  changeKobo: number;
  tableId: string | null;
  tableName: string | null;
  customerId: string | null;
  customerName: string | null;
  externalRef: string | null;
  createdAt: string;
  items: SaleItemView[];
  payments: SalePaymentView[];
  reversal: { reason: string; reversedBy: string | null; createdAt: string } | null;
}

export interface SaleSummary {
  id: string;
  receiptNo: string;
  locationName: string;
  cashierName: string | null;
  status: SaleStatus;
  totalKobo: number;
  amountPaidKobo: number;
  tableName: string | null;
  customerName: string | null;
  createdAt: string;
  itemCount: number;
}

async function resolveLocationId(
  local: LocalDb,
  businessId: string,
  requested: string | null | undefined
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

function nextReceiptNo(local: LocalDb, businessId: string, when: Date): string {
  const row = local.raw
    .prepare('SELECT COUNT(*) AS n FROM sales WHERE business_id = ?')
    .get(businessId) as { n: number };
  const seq = row.n + 1;
  const date = when;
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `R-${ymd}-${String(seq).padStart(5, '0')}`;
}

export async function createSale(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; receiptNo: string; totalKobo: number; changeKobo: number }> {
  requirePermission(new Set(grants), 'sales.create');
  const input = saleCreateSchema.parse(raw);
  const locationId = await resolveLocationId(local, businessId, input.locationId);

  // Load business tax rate for default tax computation.
  const [biz] = await local.db
    .select({ taxRateBps: businesses.taxRateBps })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) throw codedError('Business not found', 'BUSINESS_NOT_FOUND');

  // Load + validate products.
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const placeholders = productIds.map(() => '?').join(',');
  const prodRows = local.raw
    .prepare(
      `SELECT id, name, selling_price_kobo AS sellingPriceKobo, is_active AS isActive, tax_category_id AS taxCategoryId FROM products WHERE business_id = ? AND id IN (${placeholders})`
    )
    .all(businessId, ...productIds) as Array<{
    id: string;
    name: string;
    sellingPriceKobo: number;
    isActive: number;
    taxCategoryId: string | null;
  }>;
  const prodMap = new Map(prodRows.map((p) => [p.id, p]));
  for (const item of input.items) {
    const p = prodMap.get(item.productId);
    if (!p) throw codedError(`Product not found: ${item.productId}`, 'PRODUCT_NOT_FOUND');
    if (p.isActive !== 1) throw codedError(`Product is archived: ${p.name}`, 'PRODUCT_ARCHIVED');
  }

  // Compute lines: default unit price = selling price; clamp line discount.
  let subtotal = 0;
  let lineDiscountTotal = 0;
  const lines = input.items.map((item) => {
    const p = prodMap.get(item.productId)!;
    const unitPrice = item.unitPriceKobo ?? p.sellingPriceKobo;
    const gross = unitPrice * item.qty;
    const lineDiscount = Math.min(item.lineDiscountKobo, gross);
    const lineTotal = gross - lineDiscount;
    subtotal += gross;
    lineDiscountTotal += lineDiscount;
    return {
      productId: item.productId,
      qty: item.qty,
      unitPriceKobo: unitPrice,
      lineDiscountKobo: lineDiscount,
      lineTotalKobo: lineTotal,
    };
  });

  const netAfterLines = subtotal - lineDiscountTotal;
  const headerDiscount = Math.min(input.headerDiscountKobo, netAfterLines);
  const taxable = netAfterLines - headerDiscount;
  // Per-line tax: product category rate, falling back to the business default.
  // Header discount is spread proportionally across lines for the taxable base.
  let perLineTax = 0;
  const lineTaxable: number[] = [];
  if (taxable > 0 && netAfterLines > 0) {
    const catIds = [
      ...new Set(
        prodRows.map((r) => r.taxCategoryId).filter((v: string | null): v is string => v != null)
      ),
    ];
    const rateMap = new Map<string, number>();
    if (catIds.length > 0) {
      const catRows = local.raw
        .prepare(
          `SELECT id, rate_bps AS rateBps FROM tax_categories WHERE business_id = ? AND id IN (${catIds.map(() => '?').join(',')})`
        )
        .all(businessId, ...catIds) as Array<{ id: string; rateBps: number }>;
      for (const c of catRows) rateMap.set(c.id, c.rateBps);
    }
    for (const line of lines) {
      const prod = prodMap.get(line.productId)!;
      const share = (line.lineTotalKobo / netAfterLines) * headerDiscount;
      const base = Math.max(0, Math.round(line.lineTotalKobo - share));
      lineTaxable.push(base);
      const rate =
        prod.taxCategoryId != null
          ? (rateMap.get(prod.taxCategoryId) ?? biz.taxRateBps)
          : biz.taxRateBps;
      perLineTax += Math.round((base * rate) / 10000);
    }
  } else {
    lineTaxable.push(...lines.map(() => 0));
  }
  void lineTaxable;
  const taxKobo = input.taxKobo ?? perLineTax;
  const total = taxable + taxKobo;

  const amountPaid = input.payments.reduce((s, p) => s + p.amountKobo, 0);
  if (amountPaid < total)
    throw codedError(
      `Insufficient payment: paid ${amountPaid}, total ${total}`,
      'INSUFFICIENT_PAYMENT'
    );

  // Credit must be exact (no change on account sales); cash/transfer/pos may overpay.
  const hasCredit = input.payments.some((p) => p.method === 'credit');
  // Amount actually put on the customer's account (not the tender total).
  const creditAmount = input.payments
    .filter((p) => p.method === 'credit')
    .reduce((s, p) => s + p.amountKobo, 0);
  const change = amountPaid - total;
  if (hasCredit && change !== 0)
    throw codedError(
      'Credit sales must be paid exactly (no change, no shortfall)',
      'CREDIT_MUST_MATCH'
    );

  // Optional table tag: must be free, same business + location.
  let tableId: string | null = null;
  if (input.tableId != null) {
    const [tbl] = await local.db
      .select({
        id: diningTables.id,
        locationId: diningTables.locationId,
        status: diningTables.status,
        name: diningTables.name,
      })
      .from(diningTables)
      .where(and(eq(diningTables.id, input.tableId), eq(diningTables.businessId, businessId)))
      .limit(1);
    if (!tbl) throw codedError('Table not found', 'TABLE_NOT_FOUND');
    if (tbl.locationId !== locationId)
      throw codedError(`Table ${tbl.name} belongs to a different location`, 'TABLE_WRONG_LOCATION');
    if (tbl.status !== 'free')
      throw codedError(`Table ${tbl.name} is already occupied`, 'TABLE_OCCUPIED');
    tableId = tbl.id;
  }

  // Optional customer (Batch 6). Walk-in sales leave this null. A credit
  // payment requires a customer to owe against, and must respect their limit.
  let customerId: string | null = null;
  if (input.customerId != null) {
    const [cust] = await local.db
      .select({
        id: customers.id,
        name: customers.name,
        creditLimitKobo: customers.creditLimitKobo,
        isActive: customers.isActive,
      })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.businessId, businessId)))
      .limit(1);
    if (!cust) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');
    if (cust.isActive !== 1)
      throw codedError(`Customer ${cust.name} is archived`, 'CUSTOMER_ARCHIVED');
    customerId = cust.id;

    if (cust.creditLimitKobo > 0) {
      const owedSoFar = creditOutstanding(local, businessId, cust.id);
      if (owedSoFar + creditAmount > cust.creditLimitKobo) {
        throw codedError(
          `Credit limit exceeded for ${cust.name}: limit ${(cust.creditLimitKobo / 100).toFixed(2)}, owed ${(owedSoFar / 100).toFixed(2)}, this sale ${(creditAmount / 100).toFixed(2)}`,
          'CREDIT_LIMIT_EXCEEDED'
        );
      }
    }
  } else if (hasCredit) {
    throw codedError('Select a customer to sell on credit', 'CREDIT_REQUIRES_CUSTOMER');
  }

  const timestamp = input.soldAt ? new Date(input.soldAt) : new Date();
  const saleId = newId('sal');
  const receiptNo = nextReceiptNo(local, businessId, timestamp);

  const apply = local.raw.transaction(() => {
    local.db
      .insert(sales)
      .values({
        id: saleId,
        businessId,
        locationId,
        receiptNo,
        cashierId: userId,
        status: 'completed',
        subtotalKobo: subtotal,
        lineDiscountKobo: lineDiscountTotal,
        headerDiscountKobo: headerDiscount,
        taxKobo,
        totalKobo: total,
        tableId,
        customerId,
        externalRef: input.externalRef?.trim() || null,
        amountPaidKobo: amountPaid,
        changeKobo: change,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    for (const line of lines) {
      local.db
        .insert(saleItems)
        .values({
          id: newId('sit'),
          saleId,
          productId: line.productId,
          qty: line.qty,
          unitPriceKobo: line.unitPriceKobo,
          lineDiscountKobo: line.lineDiscountKobo,
          lineTotalKobo: line.lineTotalKobo,
        })
        .run();
    }

    for (const pay of input.payments) {
      local.db
        .insert(salePayments)
        .values({
          id: newId('pay'),
          saleId,
          method: pay.method,
          amountKobo: pay.amountKobo,
          reference: pay.reference,
        })
        .run();
    }

    // Ledger: one `sale` row per line; guard negative on-hand.
    for (const line of lines) {
      const cur = local.raw
        .prepare(
          'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
        )
        .get(businessId, line.productId, locationId) as { qty: number };
      const after = cur.qty - line.qty;
      if (after < 0) {
        const p = prodMap.get(line.productId)!;
        throw codedError(
          `Insufficient stock for ${p.name} (have ${cur.qty}, need ${line.qty})`,
          'NEGATIVE_STOCK'
        );
      }
      local.db
        .insert(stockMovements)
        .values({
          id: newId('mov'),
          businessId,
          productId: line.productId,
          locationId,
          kind: 'sale',
          qtyDelta: -line.qty,
          qtyAfter: after,
          reason: `Sale ${receiptNo}`,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();
    }

    writeAuditSync(local, {
      businessId,
      userId,
      action: 'sale.create',
      entity: 'sale',
      entityId: saleId,
      details: { receiptNo, totalKobo: total, itemCount: lines.length, tableId },
    });
    if (tableId != null) {
      local.db
        .update(diningTables)
        .set({ status: 'occupied', updatedAt: timestamp })
        .where(eq(diningTables.id, tableId))
        .run();
    }
  });
  apply();
  // Payment completed: the table is free again immediately.
  if (tableId != null) {
    local.db
      .update(diningTables)
      .set({ status: 'free', updatedAt: new Date() })
      .where(eq(diningTables.id, tableId))
      .run();
  }
  return { id: saleId, receiptNo, totalKobo: total, changeKobo: change };
}

export async function getSale(
  local: LocalDb,
  businessId: string,
  grants: string[],
  saleId: string
): Promise<SaleView> {
  requirePermission(new Set(grants), 'sales.view');
  const [head] = await local.db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
    .limit(1);
  if (!head) throw codedError('Sale not found', 'SALE_NOT_FOUND');

  const [loc] = await local.db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, head.locationId))
    .limit(1);
  const [cashier] = head.cashierId
    ? await local.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, head.cashierId))
        .limit(1)
    : [undefined];
  const [tbl] = head.tableId
    ? await local.db
        .select({ name: diningTables.name })
        .from(diningTables)
        .where(eq(diningTables.id, head.tableId))
        .limit(1)
    : [undefined];
  const [cust] = head.customerId
    ? await local.db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, head.customerId))
        .limit(1)
    : [undefined];

  const itemRows = await local.db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: products.name,
      sku: products.sku,
      qty: saleItems.qty,
      unitPriceKobo: saleItems.unitPriceKobo,
      lineDiscountKobo: saleItems.lineDiscountKobo,
      lineTotalKobo: saleItems.lineTotalKobo,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, saleId));

  const payRows = await local.db.select().from(salePayments).where(eq(salePayments.saleId, saleId));

  const [rev] = await local.db
    .select()
    .from(saleReversals)
    .where(eq(saleReversals.saleId, saleId))
    .limit(1);
  let reversal: SaleView['reversal'] = null;
  if (rev) {
    const [by] = rev.reversedBy
      ? await local.db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, rev.reversedBy))
          .limit(1)
      : [undefined];
    reversal = {
      reason: rev.reason,
      reversedBy: by?.name ?? null,
      createdAt: (rev.createdAt as Date).toISOString(),
    };
  }

  return {
    id: head.id,
    receiptNo: head.receiptNo,
    locationId: head.locationId,
    locationName: loc?.name ?? '',
    cashierId: head.cashierId,
    cashierName: cashier?.name ?? null,
    status: head.status as SaleStatus,
    subtotalKobo: head.subtotalKobo,
    lineDiscountKobo: head.lineDiscountKobo,
    headerDiscountKobo: head.headerDiscountKobo,
    taxKobo: head.taxKobo,
    totalKobo: head.totalKobo,
    amountPaidKobo: head.amountPaidKobo,
    changeKobo: head.changeKobo,
    tableId: head.tableId,
    tableName: tbl?.name ?? null,
    customerId: head.customerId,
    customerName: cust?.name ?? null,
    externalRef: head.externalRef ?? null,
    createdAt: (head.createdAt as Date).toISOString(),
    items: itemRows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.productName ?? '',
      sku: r.sku ?? null,
      qty: r.qty,
      unitPriceKobo: r.unitPriceKobo,
      lineDiscountKobo: r.lineDiscountKobo,
      lineTotalKobo: r.lineTotalKobo,
    })),
    payments: payRows.map((p) => ({
      id: p.id,
      method: p.method as PaymentMethod,
      amountKobo: p.amountKobo,
      reference: p.reference,
    })),
    reversal,
  };
}

export async function listSales(
  local: LocalDb,
  businessId: string,
  grants: string[],
  rawQuery: unknown
): Promise<{ items: SaleSummary[]; total: number }> {
  requirePermission(new Set(grants), 'sales.view');
  const q = salesQuerySchema.parse(rawQuery);
  const params: Array<string | number> = [businessId];
  let where = 's.business_id = ?';
  if (q.locationId) {
    where += ' AND s.location_id = ?';
    params.push(q.locationId);
  }
  if (q.status) {
    where += ' AND s.status = ?';
    params.push(q.status);
  }
  if (q.search) {
    where += ` AND s.receipt_no LIKE ? ESCAPE '\\'`;
    params.push(`%${escLike(q.search)}%`);
  }
  const from = `FROM sales s JOIN locations l ON l.id = s.location_id LEFT JOIN users u ON u.id = s.cashier_id LEFT JOIN dining_tables t ON t.id = s.table_id LEFT JOIN customers c ON c.id = s.customer_id WHERE ${where}`;
  const totalRow = local.raw.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params) as {
    n: number;
  };
  const rows = local.raw
    .prepare(
      `SELECT s.id AS id, s.receipt_no AS receiptNo, s.status AS status, s.total_kobo AS totalKobo, s.amount_paid_kobo AS amountPaidKobo, s.created_at AS createdAtMs, l.name AS locationName, u.name AS cashierName, t.name AS tableName, c.name AS customerName, (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS itemCount ${from} ORDER BY s.created_at DESC, s.rowid DESC LIMIT ? OFFSET ?`
    )
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Array<{
    id: string;
    receiptNo: string;
    status: string;
    totalKobo: number;
    amountPaidKobo: number;
    createdAtMs: number;
    locationName: string;
    cashierName: string | null;
    tableName: string | null;
    customerName: string | null;
    itemCount: number;
  }>;
  return {
    items: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      locationName: r.locationName,
      cashierName: r.cashierName,
      status: r.status as SaleStatus,
      totalKobo: r.totalKobo,
      amountPaidKobo: r.amountPaidKobo,
      tableName: r.tableName,
      customerName: r.customerName,
      createdAt: new Date(r.createdAtMs).toISOString(),
      itemCount: r.itemCount,
    })),
    total: totalRow.n,
  };
}

export async function refundSale(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  saleId: string,
  raw: unknown
): Promise<{ ok: true }> {
  requirePermission(new Set(grants), 'sales.refund');
  const input = saleRefundSchema.parse(raw);

  const [head] = await local.db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
    .limit(1);
  if (!head) throw codedError('Sale not found', 'SALE_NOT_FOUND');
  if (head.status !== 'completed') throw codedError('Sale is already reversed', 'ALREADY_REVERSED');

  const itemRows = await local.db.select().from(saleItems).where(eq(saleItems.saleId, saleId));

  const timestamp = new Date();
  const reversalId = newId('rev');
  const apply = local.raw.transaction(() => {
    // Restock: one `return` row per line.
    for (const line of itemRows) {
      const cur = local.raw
        .prepare(
          'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
        )
        .get(businessId, line.productId, head.locationId) as { qty: number };
      local.db
        .insert(stockMovements)
        .values({
          id: newId('mov'),
          businessId,
          productId: line.productId,
          locationId: head.locationId,
          kind: 'return',
          qtyDelta: line.qty,
          qtyAfter: cur.qty + line.qty,
          reason: `Refund ${head.receiptNo}: ${input.reason.trim()}`,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();
    }
    local.db
      .insert(saleReversals)
      .values({
        id: reversalId,
        saleId,
        reason: input.reason.trim(),
        reversedBy: userId,
        createdAt: timestamp,
      })
      .run();
    local.db
      .update(sales)
      .set({ status: 'refunded', updatedAt: timestamp, version: head.version + 1 })
      .where(eq(sales.id, saleId))
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'sale.refund',
      entity: 'sale',
      entityId: saleId,
      details: { receiptNo: head.receiptNo, reason: input.reason.trim() },
    });
  });
  apply();
  return { ok: true };
}

export async function voidSale(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  saleId: string,
  raw: unknown
): Promise<{ ok: true }> {
  requirePermission(new Set(grants), 'sales.refund');
  const input = saleRefundSchema.parse(raw);

  const [head] = await local.db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.businessId, businessId)))
    .limit(1);
  if (!head) throw codedError('Sale not found', 'SALE_NOT_FOUND');
  if (head.status !== 'completed') throw codedError('Sale is already reversed', 'ALREADY_REVERSED');

  const timestamp = new Date();
  const apply = local.raw.transaction(() => {
    // Void = same-day correction: restock without a separate return reason trail
    // beyond the audit record; status distinguishes it from a refund.
    const itemRows = local.raw
      .prepare('SELECT product_id AS productId, qty FROM sale_items WHERE sale_id = ?')
      .all(saleId) as Array<{ productId: string; qty: number }>;
    for (const line of itemRows) {
      const cur = local.raw
        .prepare(
          'SELECT COALESCE(SUM(qty_delta), 0) AS qty FROM stock_movements WHERE business_id = ? AND product_id = ? AND location_id = ?'
        )
        .get(businessId, line.productId, head.locationId) as { qty: number };
      local.db
        .insert(stockMovements)
        .values({
          id: newId('mov'),
          businessId,
          productId: line.productId,
          locationId: head.locationId,
          kind: 'return',
          qtyDelta: line.qty,
          qtyAfter: cur.qty + line.qty,
          reason: `Void ${head.receiptNo}: ${input.reason.trim()}`,
          userId,
          version: 1,
          createdAt: timestamp,
        })
        .run();
    }
    local.db
      .insert(saleReversals)
      .values({
        id: newId('rev'),
        saleId,
        reason: `VOID: ${input.reason.trim()}`,
        reversedBy: userId,
        createdAt: timestamp,
      })
      .run();
    local.db
      .update(sales)
      .set({ status: 'voided', updatedAt: timestamp, version: head.version + 1 })
      .where(eq(sales.id, saleId))
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'sale.void',
      entity: 'sale',
      entityId: saleId,
      details: { receiptNo: head.receiptNo, reason: input.reason.trim() },
    });
  });
  apply();
  return { ok: true };
}
