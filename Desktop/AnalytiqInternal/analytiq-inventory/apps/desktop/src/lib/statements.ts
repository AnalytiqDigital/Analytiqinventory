import type { ReportsSummary } from '../types/global';

export interface ProfitAndLoss {
  period: { from: string; to: string };
  income: {
    salesBeforeDiscountsKobo: number;
    discountsKobo: number;
    loyaltyKobo: number;
    netSalesKobo: number;
    taxKobo: number;
    totalCollectedKobo: number;
  };
  cogsKobo: number;
  grossProfitKobo: number;
  grossMarginPct: number;
  expenses: Array<{ category: string; amountKobo: number }>;
  expensesKobo: number;
  netProfitKobo: number;
  netMarginPct: number;
  memo: {
    transactions: number;
    averageBasketKobo: number;
    refundCount: number;
    refundsKobo: number;
    voidCount: number;
  };
}

export interface ProductSalesRow {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  revenueKobo: number;
  cogsKobo: number;
  profitKobo: number;
  marginPct: number;
  sharePct: number;
}

export interface ProductSalesStatement {
  period: { from: string; to: string };
  rows: ProductSalesRow[];
  totals: {
    products: number;
    qty: number;
    revenueKobo: number;
    cogsKobo: number;
    profitKobo: number;
    marginPct: number;
  };
  unsoldCount: number;
}

/** Percentage of a whole, rounded to one decimal and safe on zero. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

const pct = percentOf;

/**
 * Build a tax-exclusive profit and loss statement. Sales start at the list
 * subtotal, subtract both discount layers and the loyalty redemption, then
 * COGS and operating expenses. Sales tax is shown as collected, not income.
 */
export function buildProfitAndLoss(summary: ReportsSummary): ProfitAndLoss {
  const salesBeforeDiscountsKobo = summary.sales.subtotalKobo;
  const discountsKobo = summary.sales.discountKobo;
  const netSalesKobo = summary.sales.netKobo;
  const loyaltyKobo = Math.max(0, salesBeforeDiscountsKobo - discountsKobo - netSalesKobo);
  const expenses = summary.expenses.byCategory.map((row) => ({
    category: row.category,
    amountKobo: row.amountKobo,
  }));
  const expensesKobo = summary.expenses.totalKobo;
  const netProfitKobo = summary.sales.grossProfitKobo - expensesKobo;

  return {
    period: { from: summary.range.from, to: summary.range.to },
    income: {
      salesBeforeDiscountsKobo,
      discountsKobo,
      loyaltyKobo,
      netSalesKobo,
      taxKobo: summary.sales.taxKobo,
      totalCollectedKobo: summary.sales.grossKobo,
    },
    cogsKobo: summary.sales.cogsKobo,
    grossProfitKobo: summary.sales.grossProfitKobo,
    grossMarginPct: pct(summary.sales.grossProfitKobo, netSalesKobo),
    expenses,
    expensesKobo,
    netProfitKobo,
    netMarginPct: pct(netProfitKobo, netSalesKobo),
    memo: {
      transactions: summary.sales.transactions,
      averageBasketKobo: summary.sales.averageBasketKobo,
      refundCount: summary.sales.refundCount,
      refundsKobo: summary.sales.refundsKobo,
      voidCount: summary.sales.voidCount,
    },
  };
}

/**
 * Per-product statement for the period. Only products with sales are listed;
 * the totals row closes to 100% of product revenue so it always balances.
 */
export function buildProductSalesStatement(summary: ReportsSummary): ProductSalesStatement {
  const sold = summary.products.filter((product) => product.qty > 0);
  const revenueTotal = sold.reduce((sum, product) => sum + product.revenueKobo, 0);
  const rows: ProductSalesRow[] = sold.map((product) => ({
    productId: product.productId,
    name: product.name,
    sku: product.sku,
    qty: product.qty,
    revenueKobo: product.revenueKobo,
    cogsKobo: product.revenueKobo - product.profitKobo,
    profitKobo: product.profitKobo,
    marginPct: pct(product.profitKobo, product.revenueKobo),
    sharePct: pct(product.revenueKobo, revenueTotal),
  }));

  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const revenueKobo = rows.reduce((sum, row) => sum + row.revenueKobo, 0);
  const cogsKobo = rows.reduce((sum, row) => sum + row.cogsKobo, 0);
  const profitKobo = rows.reduce((sum, row) => sum + row.profitKobo, 0);

  return {
    period: { from: summary.range.from, to: summary.range.to },
    rows: rows.sort((a, b) => b.revenueKobo - a.revenueKobo),
    totals: {
      products: rows.length,
      qty,
      revenueKobo,
      cogsKobo,
      profitKobo,
      marginPct: pct(profitKobo, revenueKobo),
    },
    unsoldCount: Math.max(0, summary.products.length - rows.length),
  };
}

function naira(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(lines: Array<Array<string | number>>): string {
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}

export function buildProfitAndLossCsv(statement: ProfitAndLoss): string {
  const lines: Array<Array<string | number>> = [
    ['AnalytIQ profit and loss statement'],
    ['From', statement.period.from],
    ['To', statement.period.to],
    [],
    ['Line', 'Amount (NGN)'],
    ['Sales before discounts', naira(statement.income.salesBeforeDiscountsKobo)],
    ['Less: discounts', naira(statement.income.discountsKobo)],
    ['Less: loyalty points redeemed', naira(statement.income.loyaltyKobo)],
    ['Net sales (tax excluded)', naira(statement.income.netSalesKobo)],
    ['Sales tax collected', naira(statement.income.taxKobo)],
    ['Total collected', naira(statement.income.totalCollectedKobo)],
    [],
    ['Cost of goods sold', naira(statement.cogsKobo)],
    ['Gross profit', naira(statement.grossProfitKobo)],
    ['Gross margin %', statement.grossMarginPct.toFixed(1)],
    [],
    ['Operating expenses', ''],
    ...statement.expenses.map((row) => [row.category, naira(row.amountKobo)]),
    ['Total operating expenses', naira(statement.expensesKobo)],
    [],
    ['Net profit', naira(statement.netProfitKobo)],
    ['Net margin %', statement.netMarginPct.toFixed(1)],
    [],
    ['Memo', ''],
    ['Transactions', statement.memo.transactions],
    ['Average basket (NGN)', naira(statement.memo.averageBasketKobo)],
    ['Refunds', statement.memo.refundCount],
    ['Refunded amount (NGN)', naira(statement.memo.refundsKobo)],
    ['Voided sales', statement.memo.voidCount],
  ];
  return toCsv(lines);
}

export function buildProductSalesCsv(statement: ProductSalesStatement): string {
  const lines: Array<Array<string | number>> = [
    ['AnalytIQ product sales statement'],
    ['From', statement.period.from],
    ['To', statement.period.to],
    [],
    [
      'Product',
      'SKU',
      'Qty sold',
      'Revenue (NGN)',
      'Cost of goods sold (NGN)',
      'Profit (NGN)',
      'Margin %',
      'Share of product sales %',
    ],
    ...statement.rows.map((row) => [
      row.name,
      row.sku,
      row.qty,
      naira(row.revenueKobo),
      naira(row.cogsKobo),
      naira(row.profitKobo),
      row.marginPct.toFixed(1),
      row.sharePct.toFixed(1),
    ]),
    [
      'Total',
      '',
      statement.totals.qty,
      naira(statement.totals.revenueKobo),
      naira(statement.totals.cogsKobo),
      naira(statement.totals.profitKobo),
      statement.totals.marginPct.toFixed(1),
      '100.0',
    ],
    [],
    ['Products with sales', statement.totals.products],
    ['Active products without sales', statement.unsoldCount],
  ];
  return toCsv(lines);
}
