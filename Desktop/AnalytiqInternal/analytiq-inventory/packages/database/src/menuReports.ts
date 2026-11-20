// Batch 16: the extra report set behind the Reports menu.
//
// Everything here is derived at read time from the existing ledgers. Money is
// integer kobo; timestamps are epoch seconds (Drizzle timestamp mode). The
// period filter applies to sales/purchases/adjustments, while customer and
// supplier balances are as-of-now (they are not period movements).

import { reportQuerySchema } from '@analytiq/validation';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';

export interface MenuReportRange {
  from: string;
  to: string;
  locationId: string | null;
}

export interface PurchaseSaleRow {
  date: string;
  salesCount: number;
  salesKobo: number;
  purchaseCount: number;
  purchaseKobo: number;
}

export interface TaxReport {
  outputKobo: number;
  inputKobo: number;
  netKobo: number;
  daily: Array<{ date: string; outputKobo: number; inputKobo: number }>;
}

export interface CustomerBalanceRow {
  customerId: string;
  name: string;
  phone: string;
  groupName: string;
  transactions: number;
  spendKobo: number;
  balanceKobo: number;
}

export interface SupplierBalanceRow {
  supplierId: string;
  name: string;
  purchasesKobo: number;
  paidKobo: number;
  returnsKobo: number;
  balanceKobo: number;
}

export interface CustomerGroupReportRow {
  groupId: string;
  name: string;
  customers: number;
  salesKobo: number;
  creditKobo: number;
}

export interface AdjustmentReportRow {
  id: string;
  reference: string;
  date: string;
  locationName: string;
  reason: string;
  lines: number;
  qtyNet: number;
}

export interface ProductPurchaseRow {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  costKobo: number;
}

export interface PurchasePaymentRow {
  id: string;
  reference: string;
  supplierName: string;
  receivedAt: string;
  totalKobo: number;
  paidKobo: number;
  returnsKobo: number;
  balanceKobo: number;
}

export interface SellPaymentRow {
  method: string;
  count: number;
  amountKobo: number;
}

export interface RegisterRow {
  locationId: string;
  locationName: string;
  transactions: number;
  grossKobo: number;
  taxKobo: number;
  cashKobo: number;
  transferKobo: number;
  posKobo: number;
  creditKobo: number;
}

export interface SalesRepRow {
  userId: string | null;
  name: string;
  transactions: number;
  grossKobo: number;
  discountKobo: number;
  taxKobo: number;
  refundsKobo: number;
}

export interface MenuReports {
  range: MenuReportRange;
  purchaseSale: {
    daily: PurchaseSaleRow[];
    salesCount: number;
    salesKobo: number;
    purchaseCount: number;
    purchaseKobo: number;
  };
  tax: TaxReport;
  customers: CustomerBalanceRow[];
  suppliers: SupplierBalanceRow[];
  receivablesKobo: number;
  payablesKobo: number;
  customerGroups: CustomerGroupReportRow[];
  stockAdjustments: AdjustmentReportRow[];
  productPurchases: ProductPurchaseRow[];
  purchasePayments: PurchasePaymentRow[];
  sellPayments: SellPaymentRow[];
  registers: RegisterRow[];
  salesReps: SalesRepRow[];
}

type Row = Record<string, number | string | null>;

function n(row: Row | undefined, key: string): number {
  const value = row?.[key];
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function s(row: Row | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === 'string' ? value : String(value ?? '');
}

function epoch(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function getMenuReports(
  local: LocalDb,
  businessId: string,
  grants: string[],
  raw: unknown
): MenuReports {
  requirePermission(new Set(grants), 'reports.view');
  const query = reportQuerySchema.parse(raw ?? {});
  const now = new Date();
  const from = query.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ?? now;
  const locationId = query.locationId ?? null;
  const fromEpoch = epoch(from);
  const toEpoch = epoch(to);

  const locSql = locationId ? ' AND s.location_id = ?' : '';
  const locParams = locationId ? [locationId] : [];

  // --- sales and purchases by day ------------------------------------------
  const salesDaily = local.raw
    .prepare(
      `SELECT date(s.created_at, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS n, COALESCE(SUM(s.total_kobo), 0) AS total,
              COALESCE(SUM(s.tax_kobo), 0) AS tax
         FROM sales s
        WHERE s.business_id = ? AND s.status = 'completed'
          AND s.created_at BETWEEN ? AND ?${locSql}
        GROUP BY day ORDER BY day`
    )
    .all(businessId, fromEpoch, toEpoch, ...locParams) as Row[];

  const purchaseDaily = local.raw
    .prepare(
      `SELECT date(p.created_at, 'unixepoch', 'localtime') AS day,
              COUNT(*) AS n, COALESCE(SUM(p.total_kobo), 0) AS total,
              COALESCE(SUM(p.tax_kobo), 0) AS tax
         FROM purchases p
        WHERE p.business_id = ? AND p.status = 'received'
          AND p.created_at BETWEEN ? AND ?
        GROUP BY day ORDER BY day`
    )
    .all(businessId, fromEpoch, toEpoch) as Row[];

  const byDay = new Map<string, PurchaseSaleRow>();
  for (const r of salesDaily) {
    const day = s(r, 'day');
    byDay.set(day, {
      date: day,
      salesCount: n(r, 'n'),
      salesKobo: n(r, 'total'),
      purchaseCount: 0,
      purchaseKobo: 0,
    });
  }
  for (const r of purchaseDaily) {
    const day = s(r, 'day');
    const row = byDay.get(day) ?? {
      date: day,
      salesCount: 0,
      salesKobo: 0,
      purchaseCount: 0,
      purchaseKobo: 0,
    };
    row.purchaseCount = n(r, 'n');
    row.purchaseKobo = n(r, 'total');
    byDay.set(day, row);
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  const salesCount = salesDaily.reduce((sum, r) => sum + n(r, 'n'), 0);
  const salesKobo = salesDaily.reduce((sum, r) => sum + n(r, 'total'), 0);
  const purchaseCount = purchaseDaily.reduce((sum, r) => sum + n(r, 'n'), 0);
  const purchaseKobo = purchaseDaily.reduce((sum, r) => sum + n(r, 'total'), 0);

  const outputTax = salesDaily.reduce((sum, r) => sum + n(r, 'tax'), 0);
  const inputTax = purchaseDaily.reduce((sum, r) => sum + n(r, 'tax'), 0);
  const taxDaily = daily.map((d) => {
    const saleRow = salesDaily.find((r) => s(r, 'day') === d.date);
    const purchaseRow = purchaseDaily.find((r) => s(r, 'day') === d.date);
    return {
      date: d.date,
      outputKobo: n(saleRow, 'tax'),
      inputKobo: n(purchaseRow, 'tax'),
    };
  });

  // --- customer balances (as of now) ---------------------------------------
  const customerRows = local.raw
    .prepare(
      `SELECT c.id AS customerId, c.name AS name, c.phone AS phone,
              COALESCE(g.name, '') AS groupName,
              COALESCE((SELECT COUNT(*) FROM sales s2
                         WHERE s2.customer_id = c.id AND s2.business_id = c.business_id
                           AND s2.status = 'completed' AND s2.created_at BETWEEN ? AND ?), 0) AS transactions,
              COALESCE((SELECT SUM(s3.total_kobo) FROM sales s3
                         WHERE s3.customer_id = c.id AND s3.business_id = c.business_id
                           AND s3.status = 'completed' AND s3.created_at BETWEEN ? AND ?), 0) AS spend,
              COALESCE((SELECT SUM(sp.amount_kobo) FROM sale_payments sp
                         JOIN sales s4 ON s4.id = sp.sale_id
                        WHERE s4.customer_id = c.id AND s4.business_id = c.business_id
                          AND s4.status = 'completed' AND sp.method = 'credit'), 0)
              - COALESCE((SELECT SUM(cp.amount_kobo) FROM customer_payments cp
                           WHERE cp.customer_id = c.id AND cp.business_id = c.business_id), 0) AS balance
         FROM customers c
         LEFT JOIN customer_groups g ON g.id = c.group_id
        WHERE c.business_id = ? AND c.is_active = 1
        ORDER BY balance DESC, c.name ASC
        LIMIT 200`
    )
    .all(fromEpoch, toEpoch, fromEpoch, toEpoch, businessId) as Row[];

  const customers: CustomerBalanceRow[] = customerRows.map((r) => ({
    customerId: s(r, 'customerId'),
    name: s(r, 'name'),
    phone: s(r, 'phone'),
    groupName: s(r, 'groupName'),
    transactions: n(r, 'transactions'),
    spendKobo: n(r, 'spend'),
    balanceKobo: n(r, 'balance'),
  }));
  const receivablesKobo = customers.reduce((sum, c) => sum + Math.max(0, c.balanceKobo), 0);

  // --- supplier balances (as of now) ---------------------------------------
  const supplierRows = local.raw
    .prepare(
      `SELECT sup.id AS supplierId, sup.name AS name,
              COALESCE(SUM(p.total_kobo), 0) AS purchases,
              COALESCE(SUM(p.amount_paid_kobo), 0) AS paid,
              COALESCE((SELECT SUM(r.total_kobo) FROM purchase_returns r
                         WHERE r.supplier_id = sup.id AND r.business_id = sup.business_id), 0) AS returns
         FROM suppliers sup
         LEFT JOIN purchases p ON p.supplier_id = sup.id AND p.status = 'received'
        WHERE sup.business_id = ? AND sup.is_active = 1
        GROUP BY sup.id
        ORDER BY sup.name ASC
        LIMIT 200`
    )
    .all(businessId) as Row[];

  const suppliers: SupplierBalanceRow[] = supplierRows.map((r) => {
    const purchases = n(r, 'purchases');
    const paid = n(r, 'paid');
    const returns = n(r, 'returns');
    return {
      supplierId: s(r, 'supplierId'),
      name: s(r, 'name'),
      purchasesKobo: purchases,
      paidKobo: paid,
      returnsKobo: returns,
      balanceKobo: purchases - paid - returns,
    };
  });
  const payablesKobo = suppliers.reduce((sum, sup) => sum + Math.max(0, sup.balanceKobo), 0);

  // --- customer groups ------------------------------------------------------
  const groupRows = local.raw
    .prepare(
      `SELECT g.id AS groupId, g.name AS name,
              (SELECT COUNT(*) FROM customers c
                WHERE c.group_id = g.id AND c.is_active = 1) AS customers,
              COALESCE((SELECT SUM(s.total_kobo) FROM sales s
                         JOIN customers c ON c.id = s.customer_id
                        WHERE c.group_id = g.id AND s.business_id = g.business_id
                          AND s.status = 'completed' AND s.created_at BETWEEN ? AND ?), 0) AS sales,
              COALESCE((SELECT SUM(sp.amount_kobo) FROM sale_payments sp
                         JOIN sales s2 ON s2.id = sp.sale_id
                         JOIN customers c2 ON c2.id = s2.customer_id
                        WHERE c2.group_id = g.id AND s2.business_id = g.business_id
                          AND s2.status = 'completed' AND sp.method = 'credit'), 0)
              - COALESCE((SELECT SUM(cp.amount_kobo) FROM customer_payments cp
                           JOIN customers c3 ON c3.id = cp.customer_id
                          WHERE c3.group_id = g.id AND cp.business_id = g.business_id), 0) AS credit
         FROM customer_groups g
        WHERE g.business_id = ? AND g.is_active = 1
        ORDER BY g.name ASC`
    )
    .all(fromEpoch, toEpoch, businessId) as Row[];

  const customerGroups: CustomerGroupReportRow[] = groupRows.map((r) => ({
    groupId: s(r, 'groupId'),
    name: s(r, 'name'),
    customers: n(r, 'customers'),
    salesKobo: n(r, 'sales'),
    creditKobo: n(r, 'credit'),
  }));

  // --- stock adjustments ----------------------------------------------------
  const adjustmentRows = local.raw
    .prepare(
      `SELECT a.id AS id, a.reference AS reference,
              date(a.created_at, 'unixepoch', 'localtime') AS day,
              COALESCE(l.name, '') AS locationName, a.reason AS reason,
              (SELECT COUNT(*) FROM stock_adjustment_items i
                WHERE i.adjustment_id = a.id) AS lines,
              COALESCE((SELECT SUM(i.qty_delta) FROM stock_adjustment_items i
                         WHERE i.adjustment_id = a.id), 0) AS qty
         FROM stock_adjustments a
         LEFT JOIN locations l ON l.id = a.location_id
        WHERE a.business_id = ? AND a.created_at BETWEEN ? AND ?
        ORDER BY a.created_at DESC LIMIT 200`
    )
    .all(businessId, fromEpoch, toEpoch) as Row[];

  const stockAdjustments: AdjustmentReportRow[] = adjustmentRows.map((r) => ({
    id: s(r, 'id'),
    reference: s(r, 'reference'),
    date: s(r, 'day'),
    locationName: s(r, 'locationName'),
    reason: s(r, 'reason'),
    lines: n(r, 'lines'),
    qtyNet: n(r, 'qty'),
  }));

  // --- purchases by product -------------------------------------------------
  const productPurchaseRows = local.raw
    .prepare(
      `SELECT p.id AS productId, p.name AS name, COALESCE(p.sku, '') AS sku,
              COALESCE(SUM(pi.qty), 0) AS qty,
              COALESCE(SUM(pi.line_total_kobo), 0) AS cost
         FROM purchase_items pi
         JOIN purchases pu ON pu.id = pi.purchase_id
         JOIN products p ON p.id = pi.product_id
        WHERE pu.business_id = ? AND pu.status = 'received' AND pu.received_at BETWEEN ? AND ?
        GROUP BY p.id
        ORDER BY cost DESC LIMIT 200`
    )
    .all(businessId, fromEpoch, toEpoch) as Row[];

  const productPurchases: ProductPurchaseRow[] = productPurchaseRows.map((r) => ({
    productId: s(r, 'productId'),
    name: s(r, 'name'),
    sku: s(r, 'sku'),
    qty: n(r, 'qty'),
    costKobo: n(r, 'cost'),
  }));

  // --- purchase payments ----------------------------------------------------
  const purchasePaymentRows = local.raw
    .prepare(
      `SELECT pu.id AS id, pu.reference AS reference,
              COALESCE(sup.name, 'Walk-in supplier') AS supplierName,
              pu.received_at AS receivedAt, pu.total_kobo AS total,
              pu.amount_paid_kobo AS paid,
              COALESCE((SELECT SUM(r.total_kobo) FROM purchase_returns r
                         WHERE r.purchase_id = pu.id), 0) AS returns
         FROM purchases pu
         LEFT JOIN suppliers sup ON sup.id = pu.supplier_id
        WHERE pu.business_id = ? AND pu.status = 'received' AND pu.received_at BETWEEN ? AND ?
        ORDER BY pu.received_at DESC LIMIT 200`
    )
    .all(businessId, fromEpoch, toEpoch) as Row[];

  const purchasePayments: PurchasePaymentRow[] = purchasePaymentRows.map((r) => {
    const total = n(r, 'total');
    const paid = n(r, 'paid');
    const returns = n(r, 'returns');
    const receivedMs = n(r, 'receivedAt');
    return {
      id: s(r, 'id'),
      reference: s(r, 'reference'),
      supplierName: s(r, 'supplierName'),
      receivedAt: receivedMs ? new Date(receivedMs * 1000).toISOString() : '',
      totalKobo: total,
      paidKobo: paid,
      returnsKobo: returns,
      balanceKobo: total - paid - returns,
    };
  });

  // --- sell payments --------------------------------------------------------
  const sellPaymentRows = local.raw
    .prepare(
      `SELECT sp.method AS method, COUNT(*) AS n, COALESCE(SUM(sp.amount_kobo), 0) AS amount
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
        WHERE s.business_id = ? AND s.status = 'completed'
          AND s.created_at BETWEEN ? AND ?${locSql}
        GROUP BY sp.method ORDER BY amount DESC`
    )
    .all(businessId, fromEpoch, toEpoch, ...locParams) as Row[];

  const sellPayments: SellPaymentRow[] = sellPaymentRows.map((r) => ({
    method: s(r, 'method'),
    count: n(r, 'n'),
    amountKobo: n(r, 'amount'),
  }));

  // --- register (till/location) summary -------------------------------------
  const registerRows = local.raw
    .prepare(
      `WITH period AS (
         SELECT s.id AS id, s.location_id AS location_id, s.total_kobo AS total, s.tax_kobo AS tax
           FROM sales s
          WHERE s.business_id = ? AND s.status = 'completed'
            AND s.created_at BETWEEN ? AND ?${locSql}
       )
       SELECT l.id AS locationId, l.name AS locationName,
              COUNT(p.id) AS n,
              COALESCE(SUM(p.total), 0) AS gross,
              COALESCE(SUM(p.tax), 0) AS tax,
              COALESCE(SUM((SELECT SUM(x.amount_kobo) FROM sale_payments x
                             WHERE x.sale_id = p.id AND x.method = 'cash')), 0) AS cash,
              COALESCE(SUM((SELECT SUM(x.amount_kobo) FROM sale_payments x
                             WHERE x.sale_id = p.id AND x.method = 'transfer')), 0) AS transfer,
              COALESCE(SUM((SELECT SUM(x.amount_kobo) FROM sale_payments x
                             WHERE x.sale_id = p.id AND x.method = 'pos')), 0) AS pos,
              COALESCE(SUM((SELECT SUM(x.amount_kobo) FROM sale_payments x
                             WHERE x.sale_id = p.id AND x.method = 'credit')), 0) AS credit
         FROM locations l
         LEFT JOIN period p ON p.location_id = l.id
        WHERE l.business_id = ?
        GROUP BY l.id
        ORDER BY l.name ASC`
    )
    .all(businessId, fromEpoch, toEpoch, ...locParams, businessId) as Row[];

  const registers: RegisterRow[] = registerRows.map((r) => ({
    locationId: s(r, 'locationId'),
    locationName: s(r, 'locationName'),
    transactions: n(r, 'n'),
    grossKobo: n(r, 'gross'),
    taxKobo: n(r, 'tax'),
    cashKobo: n(r, 'cash'),
    transferKobo: n(r, 'transfer'),
    posKobo: n(r, 'pos'),
    creditKobo: n(r, 'credit'),
  }));

  // --- sales representatives (cashiers) -------------------------------------
  const repRows = local.raw
    .prepare(
      `SELECT s.cashier_id AS userId, COALESCE(u.name, 'Counter (no login)') AS name,
              COUNT(*) AS n,
              COALESCE(SUM(s.total_kobo), 0) AS gross,
              COALESCE(SUM(s.line_discount_kobo + s.header_discount_kobo), 0) AS discount,
              COALESCE(SUM(s.tax_kobo), 0) AS tax
         FROM sales s
         LEFT JOIN users u ON u.id = s.cashier_id
        WHERE s.business_id = ? AND s.status = 'completed'
          AND s.created_at BETWEEN ? AND ?${locSql}
        GROUP BY s.cashier_id
        ORDER BY gross DESC`
    )
    .all(businessId, fromEpoch, toEpoch, ...locParams) as Row[];

  const refundRows = local.raw
    .prepare(
      `SELECT s.cashier_id AS userId, COALESCE(SUM(r.refund_kobo), 0) AS refunds
         FROM sale_returns r
         JOIN sales s ON s.id = r.sale_id
        WHERE r.business_id = ? AND r.created_at BETWEEN ? AND ?
        GROUP BY s.cashier_id`
    )
    .all(businessId, fromEpoch, toEpoch) as Row[];
  const refundsByUser = new Map(refundRows.map((r) => [s(r, 'userId'), n(r, 'refunds')]));

  const salesReps: SalesRepRow[] = repRows.map((r) => ({
    userId: s(r, 'userId') || null,
    name: s(r, 'name'),
    transactions: n(r, 'n'),
    grossKobo: n(r, 'gross'),
    discountKobo: n(r, 'discount'),
    taxKobo: n(r, 'tax'),
    refundsKobo: refundsByUser.get(s(r, 'userId')) ?? 0,
  }));

  return {
    range: { from: from.toISOString(), to: to.toISOString(), locationId },
    purchaseSale: { daily, salesCount, salesKobo, purchaseCount, purchaseKobo },
    tax: { outputKobo: outputTax, inputKobo: inputTax, netKobo: outputTax - inputTax, daily: taxDaily },
    customers,
    suppliers,
    receivablesKobo,
    payablesKobo,
    customerGroups,
    stockAdjustments,
    productPurchases,
    purchasePayments,
    sellPayments,
    registers,
    salesReps,
  };
}
