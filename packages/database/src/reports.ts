// Batch 9: reports and BI. Every figure is derived from the ledger at read
// time — no report is ever stored, so numbers can never drift.
//
// Money is integer kobo. COGS uses each product's current cost price, which is
// refreshed when a purchase is received; historical cost snapshots are not kept
// (documented in docs/REPORTING.md).

import { reportQuerySchema } from '@analytiq/validation';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';

export interface ReportRange {
  from: string;
  to: string;
  locationId: string | null;
}

export interface ReportSalesBlock {
  transactions: number;
  subtotalKobo: number;
  discountKobo: number;
  taxKobo: number;
  grossKobo: number;
  netKobo: number;
  refundCount: number;
  refundsKobo: number;
  voidCount: number;
  cogsKobo: number;
  grossProfitKobo: number;
  averageBasketKobo: number;
}

export interface ReportPaymentRow {
  method: string;
  count: number;
  amountKobo: number;
}

export interface ReportDayRow {
  date: string;
  transactions: number;
  grossKobo: number;
  taxKobo: number;
}

export interface ReportProductRow {
  productId: string;
  name: string;
  qty: number;
  revenueKobo: number;
  profitKobo: number;
}

export interface ReportCustomerRow {
  customerId: string | null;
  name: string;
  transactions: number;
  totalKobo: number;
}

export interface ReportInventoryBlock {
  productCount: number;
  lowStockCount: number;
  costValueKobo: number;
  retailValueKobo: number;
}

export interface ReportPurchaseBlock {
  receivedCount: number;
  receivedKobo: number;
}

export interface ReportCreditBlock {
  outstandingKobo: number;
  activeCustomers: number;
}

export interface ReportsSummary {
  range: ReportRange;
  sales: ReportSalesBlock;
  payments: ReportPaymentRow[];
  daily: ReportDayRow[];
  topProducts: ReportProductRow[];
  topCustomers: ReportCustomerRow[];
  cashiers: ReportCustomerRow[];
  inventory: ReportInventoryBlock;
  purchases: ReportPurchaseBlock;
  credit: ReportCreditBlock;
}

interface Filter {
  where: string;
  params: Record<string, unknown>;
}

function epoch(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Filter on sales alias `s`, optionally scoped to one location. */
function salesFilter(businessId: string, from: Date, to: Date, locationId: string | null): Filter {
  const params: Record<string, unknown> = {
    business: businessId,
    from: epoch(from),
    to: epoch(to),
  };
  let where = 's.business_id = @business AND s.created_at BETWEEN @from AND @to';
  if (locationId) {
    where += ' AND s.location_id = @location';
    params.location = locationId;
  }
  return { where, params };
}

type Row = Record<string, number | string | null>;

function int(row: Row | undefined, key: string): number {
  const value = row?.[key];
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function text(row: Row | undefined, key: string): string {
  const value = row?.[key];
  return typeof value === 'string' ? value : String(value ?? '');
}

function withLimit(params: Record<string, unknown>, limit: number): Record<string, unknown> {
  return { ...params, limit };
}

function fillDaily(rows: ReportDayRow[], from: Date, to: Date): ReportDayRow[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366) return rows;
  const out: ReportDayRow[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    out.push(byDate.get(key) ?? { date: key, transactions: 0, grossKobo: 0, taxKobo: 0 });
  }
  return out;
}

export function getReportsSummary(
  local: LocalDb,
  businessId: string,
  grants: string[],
  raw: unknown
): ReportsSummary {
  requirePermission(new Set(grants), 'reports.view');

  const query = reportQuerySchema.parse(raw ?? {});
  const now = new Date();
  const to = query.to ?? now;
  const from = query.from ?? startOfMonth(to);
  if (from.getTime() > to.getTime()) {
    const err = new Error('Report start date must be before the end date');
    (err as NodeJS.ErrnoException).code = 'INVALID_RANGE';
    throw err;
  }
  const locationId = query.locationId ?? null;
  const filter = salesFilter(businessId, from, to, locationId);
  const limit = query.topLimit;

  const totals = local.raw
    .prepare(
      `SELECT COUNT(*) AS transactions,
              COALESCE(SUM(s.subtotal_kobo), 0) AS subtotal,
              COALESCE(SUM(s.line_discount_kobo + s.header_discount_kobo), 0) AS discounts,
              COALESCE(SUM(s.tax_kobo), 0) AS tax,
              COALESCE(SUM(s.total_kobo), 0) AS gross
         FROM sales s
        WHERE ${filter.where} AND s.status = 'completed'`
    )
    .get(filter.params) as Row | undefined;

  const refunds = local.raw
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(s.total_kobo), 0) AS total
         FROM sales s
        WHERE ${filter.where} AND s.status = 'refunded'`
    )
    .get(filter.params) as Row | undefined;

  const voids = local.raw
    .prepare(
      `SELECT COUNT(*) AS n
         FROM sales s
        WHERE ${filter.where} AND s.status = 'voided'`
    )
    .get(filter.params) as Row | undefined;

  const cogsRow = local.raw
    .prepare(
      `SELECT COALESCE(SUM(si.qty * p.cost_price_kobo), 0) AS cogs
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
        WHERE ${filter.where} AND s.status = 'completed'`
    )
    .get(filter.params) as Row | undefined;

  const grossKobo = int(totals, 'gross');
  const taxKobo = int(totals, 'tax');
  const transactions = int(totals, 'transactions');
  const cogsKobo = int(cogsRow, 'cogs');
  const netKobo = grossKobo - taxKobo;

  const payments = (
    local.raw
      .prepare(
        `SELECT sp.method AS method, COUNT(*) AS n, COALESCE(SUM(sp.amount_kobo), 0) AS amount
           FROM sale_payments sp
           JOIN sales s ON s.id = sp.sale_id
          WHERE ${filter.where} AND s.status = 'completed'
          GROUP BY sp.method
          ORDER BY amount DESC`
      )
      .all(filter.params) as Row[]
  ).map((r) => ({ method: text(r, 'method'), count: int(r, 'n'), amountKobo: int(r, 'amount') }));

  const dailyRows = (
    local.raw
      .prepare(
        `SELECT date(s.created_at, 'unixepoch', 'localtime') AS day,
                COUNT(*) AS n,
                COALESCE(SUM(s.total_kobo), 0) AS gross,
                COALESCE(SUM(s.tax_kobo), 0) AS tax
           FROM sales s
          WHERE ${filter.where} AND s.status = 'completed'
          GROUP BY day
          ORDER BY day`
      )
      .all(filter.params) as Row[]
  ).map((r) => ({
    date: text(r, 'day'),
    transactions: int(r, 'n'),
    grossKobo: int(r, 'gross'),
    taxKobo: int(r, 'tax'),
  }));

  const topProducts = (
    local.raw
      .prepare(
        `SELECT p.id AS id, p.name AS name,
                SUM(si.qty) AS qty,
                SUM(si.line_total_kobo) AS revenue,
                SUM(si.qty * p.cost_price_kobo) AS cost
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
          WHERE ${filter.where} AND s.status = 'completed'
          GROUP BY p.id
          ORDER BY revenue DESC
          LIMIT @limit`
      )
      .all(withLimit(filter.params, limit)) as Row[]
  ).map((r) => ({
    productId: text(r, 'id'),
    name: text(r, 'name'),
    qty: int(r, 'qty'),
    revenueKobo: int(r, 'revenue'),
    profitKobo: int(r, 'revenue') - int(r, 'cost'),
  }));

  const topCustomers = (
    local.raw
      .prepare(
        `SELECT c.id AS id, c.name AS name, COUNT(*) AS n, SUM(s.total_kobo) AS total
           FROM sales s
           JOIN customers c ON c.id = s.customer_id
          WHERE ${filter.where} AND s.status = 'completed' AND s.customer_id IS NOT NULL
          GROUP BY c.id
          ORDER BY total DESC
          LIMIT @limit`
      )
      .all(withLimit(filter.params, limit)) as Row[]
  ).map((r) => ({
    customerId: text(r, 'id'),
    name: text(r, 'name'),
    transactions: int(r, 'n'),
    totalKobo: int(r, 'total'),
  }));

  const cashiers = (
    local.raw
      .prepare(
        `SELECT s.cashier_id AS id, COALESCE(u.name, 'Walk-in') AS name,
                COUNT(*) AS n, SUM(s.total_kobo) AS total
           FROM sales s
           LEFT JOIN users u ON u.id = s.cashier_id
          WHERE ${filter.where} AND s.status = 'completed'
          GROUP BY s.cashier_id
          ORDER BY total DESC
          LIMIT @limit`
      )
      .all(withLimit(filter.params, limit)) as Row[]
  ).map((r) => ({
    customerId: r.id === null ? null : text(r, 'id'),
    name: text(r, 'name'),
    transactions: int(r, 'n'),
    totalKobo: int(r, 'total'),
  }));

  const inventoryParams: Record<string, unknown> = { business: businessId };
  let movementWhere = 'business_id = @business';
  if (locationId) {
    movementWhere += ' AND location_id = @location';
    inventoryParams.location = locationId;
  }
  const inventoryRow = local.raw
    .prepare(
      `SELECT COUNT(*) AS products,
              COALESCE(SUM(stock.on_hand * p.cost_price_kobo), 0) AS cost_value,
              COALESCE(SUM(stock.on_hand * p.selling_price_kobo), 0) AS retail_value,
              COALESCE(SUM(CASE WHEN p.reorder_level > 0 AND stock.on_hand <= p.reorder_level
                                THEN 1 ELSE 0 END), 0) AS low_stock
         FROM (SELECT product_id, SUM(qty_delta) AS on_hand
                 FROM stock_movements
                WHERE ${movementWhere}
                GROUP BY product_id) stock
         JOIN products p ON p.id = stock.product_id
        WHERE p.is_active = 1`
    )
    .get(inventoryParams) as Row | undefined;

  const purchaseParams: Record<string, unknown> = {
    business: businessId,
    from: epoch(from),
    to: epoch(to),
  };
  let purchaseWhere = 'p.business_id = @business AND p.created_at BETWEEN @from AND @to';
  if (locationId) {
    purchaseWhere += ' AND p.location_id = @location';
    purchaseParams.location = locationId;
  }
  const purchaseRow = local.raw
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(p.total_kobo), 0) AS total
         FROM purchases p
        WHERE ${purchaseWhere} AND p.status = 'received'`
    )
    .get(purchaseParams) as Row | undefined;

  const creditParams: Record<string, unknown> = { business: businessId };
  let creditSaleWhere =
    "s.business_id = @business AND sp.method = 'credit' AND s.status = 'completed'";
  if (locationId) {
    creditSaleWhere += ' AND s.location_id = @location';
    creditParams.location = locationId;
  }
  const creditRow = local.raw
    .prepare(
      `SELECT COALESCE(
                (SELECT SUM(sp.amount_kobo)
                   FROM sale_payments sp
                   JOIN sales s ON s.id = sp.sale_id
                  WHERE ${creditSaleWhere}), 0)
              - COALESCE((SELECT SUM(amount_kobo) FROM customer_payments WHERE business_id = @business), 0)
              AS outstanding,
              (SELECT COUNT(*) FROM customers WHERE business_id = @business AND is_active = 1)
              AS active_customers`
    )
    .get(creditParams) as Row | undefined;

  return {
    range: { from: from.toISOString(), to: to.toISOString(), locationId },
    sales: {
      transactions,
      subtotalKobo: int(totals, 'subtotal'),
      discountKobo: int(totals, 'discounts'),
      taxKobo,
      grossKobo,
      netKobo,
      refundCount: int(refunds, 'n'),
      refundsKobo: int(refunds, 'total'),
      voidCount: int(voids, 'n'),
      cogsKobo,
      grossProfitKobo: netKobo - cogsKobo,
      averageBasketKobo: transactions > 0 ? Math.round(grossKobo / transactions) : 0,
    },
    payments,
    daily: fillDaily(dailyRows, from, to),
    topProducts,
    topCustomers,
    cashiers,
    inventory: {
      productCount: int(inventoryRow, 'products'),
      lowStockCount: int(inventoryRow, 'low_stock'),
      costValueKobo: int(inventoryRow, 'cost_value'),
      retailValueKobo: int(inventoryRow, 'retail_value'),
    },
    purchases: {
      receivedCount: int(purchaseRow, 'n'),
      receivedKobo: int(purchaseRow, 'total'),
    },
    credit: {
      outstandingKobo: int(creditRow, 'outstanding'),
      activeCustomers: int(creditRow, 'active_customers'),
    },
  };
}
