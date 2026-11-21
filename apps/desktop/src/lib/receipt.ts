// Receipt HTML for thermal printers (58/76/80 mm rolls).
//
// Kept as a pure function so it can be unit-tested and reused for the settings
// test print, the POS auto-print and manual reprints from sales history.

import { formatKobo } from './money';
import type { BusinessProfile, SaleDetail } from '../types/global';

export type ReceiptWidthMm = 58 | 76 | 80;

export interface ReceiptOptions {
  widthMm?: ReceiptWidthMm;
  footer?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  pos: 'POS',
  credit: 'Credit',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function money(kobo: number, currency: string): string {
  return escapeHtml(formatKobo(kobo, currency));
}

function row(label: string, amount: string, className = ''): string {
  return `<tr${className ? ` class="${className}"` : ''}><td>${label}</td><td class="amt">${amount}</td></tr>`;
}

export function buildReceiptHtml(
  sale: SaleDetail,
  business: BusinessProfile | null,
  options: ReceiptOptions = {}
): string {
  const width = options.widthMm ?? 80;
  const currency = business?.currency || 'NGN';
  const fontSize = width <= 58 ? '9px' : '11px';
  const contentWidth = width - 4;

  const header: string[] = [];
  if (business?.name) header.push(`<div class="biz">${escapeHtml(business.name)}</div>`);
  if (business?.address) header.push(`<div>${escapeHtml(business.address)}</div>`);
  const locality = [business?.lga, business?.state].filter(Boolean).join(', ');
  if (locality) header.push(`<div>${escapeHtml(locality)}</div>`);
  if (business?.phone) header.push(`<div>Tel: ${escapeHtml(business.phone)}</div>`);

  const meta: string[] = [
    `<div class="title">SALE RECEIPT</div>`,
    `<div>${escapeHtml(sale.receiptNo)}</div>`,
    `<div>${escapeHtml(new Date(sale.createdAt).toLocaleString())}</div>`,
  ];
  const who = [sale.locationName, sale.cashierName].filter(Boolean).join(' · ');
  if (who) meta.push(`<div>${escapeHtml(who)}</div>`);
  if (sale.tableName) meta.push(`<div class="bold">${escapeHtml(sale.tableName)}</div>`);
  const orderType = ORDER_TYPE_LABELS[sale.orderType] ?? '';
  if (orderType) meta.push(`<div>${escapeHtml(orderType)}</div>`);
  if (sale.waiterName) meta.push(`<div>Waiter: ${escapeHtml(sale.waiterName)}</div>`);

  const items = sale.items
    .map((item) => {
      const discount =
        item.lineDiscountKobo > 0
          ? `<div>less ${money(item.lineDiscountKobo, currency)}</div>`
          : '';
      return `<tr><td>${escapeHtml(item.productName)} × ${item.qty}<div class="sub">@ ${money(
        item.unitPriceKobo,
        currency
      )}</div>${discount}</td><td class="amt">${money(item.lineTotalKobo, currency)}</td></tr>`;
    })
    .join('');

  const totals: string[] = [row('Subtotal', money(sale.subtotalKobo, currency))];
  if (sale.lineDiscountKobo > 0) {
    totals.push(row('Line discounts', `-${money(sale.lineDiscountKobo, currency)}`));
  }
  if (sale.headerDiscountKobo > 0) {
    totals.push(row('Discount', `-${money(sale.headerDiscountKobo, currency)}`));
  }
  totals.push(row('Tax', money(sale.taxKobo, currency)));
  if (sale.serviceChargeKobo > 0) {
    totals.push(row('Service charge', money(sale.serviceChargeKobo, currency)));
  }
  if (sale.tipKobo > 0) {
    totals.push(row('Tip', money(sale.tipKobo, currency)));
  }
  if (sale.loyaltyDiscountKobo > 0) {
    totals.push(row('Loyalty points', `-${money(sale.loyaltyDiscountKobo, currency)}`));
  }
  totals.push(
    row('<strong>TOTAL</strong>', `<strong>${money(sale.totalKobo, currency)}</strong>`, 'total')
  );

  const payments = sale.payments
    .map((payment) => {
      const label = PAYMENT_LABELS[payment.method] ?? payment.method;
      const ref = payment.reference ? ` (${escapeHtml(payment.reference)})` : '';
      return row(escapeHtml(label) + ref, money(payment.amountKobo, currency));
    })
    .join('');
  const change = sale.changeKobo > 0 ? row('Change', money(sale.changeKobo, currency)) : '';
  const loyalty =
    sale.loyaltyPointsEarned > 0
      ? `<div class="center">You earned ${sale.loyaltyPointsEarned} loyalty point${
          sale.loyaltyPointsEarned === 1 ? '' : 's'
        }</div>`
      : '';

  const status =
    sale.status !== 'completed'
      ? `<div class="center bold status">*** ${escapeHtml(sale.status.toUpperCase())} ***</div>`
      : '';
  const footer = options.footer ? `<div class="center">${escapeHtml(options.footer)}</div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(
    sale.receiptNo
  )}</title><style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { width: ${contentWidth}mm; margin: 0 auto; padding: 2mm 0; font-family: "Courier New", monospace;
  font-size: ${fontSize}; line-height: 1.25; color: #000; }
.center { text-align: center; }
.bold { font-weight: bold; }
.biz { font-size: ${width <= 58 ? '11px' : '14px'}; font-weight: bold; }
.title { font-weight: bold; margin-top: 2px; }
.head { text-align: center; margin-bottom: 2mm; }
table { width: 100%; border-collapse: collapse; }
td { padding: 0; vertical-align: top; }
.amt { text-align: right; white-space: nowrap; padding-left: 2mm; }
.sub { font-size: ${width <= 58 ? '8px' : '10px'}; }
.totals td { padding-top: 1px; }
.totals tr.total td { border-top: 1px dashed #000; padding-top: 1mm; margin-top: 1mm; }
.items { margin: 1mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
.status { margin-top: 1mm; }
.thanks { margin-top: 2mm; }
</style></head><body>
<div class="head">${header.join('')}${meta.join('')}</div>
<table class="items"><tbody>${items}</tbody></table>
<table class="totals"><tbody>${totals.join('')}${payments}${change}</tbody></table>
<div class="center thanks">Thank you for your patronage!</div>
${status}${loyalty}${footer}
</body></html>`;
}

/**
 * Kitchen order ticket: quantities and item names only, in the kitchen's own
 * print size, so the pass can read it at a glance.
 */
export function buildKitchenTicketHtml(
  sale: SaleDetail,
  options: ReceiptOptions = {}
): string {
  const width = options.widthMm ?? 80;
  const fontSize = width <= 58 ? '11px' : '13px';
  const contentWidth = width - 4;

  const meta: string[] = [
    `<div class="title">KITCHEN ORDER TICKET</div>`,
    `<div class="big">${escapeHtml(sale.receiptNo)}</div>`,
    `<div>${escapeHtml(new Date(sale.createdAt).toLocaleString())}</div>`,
  ];
  const orderType = ORDER_TYPE_LABELS[sale.orderType] ?? '';
  if (orderType) meta.push(`<div class="big">${escapeHtml(orderType)}</div>`);
  if (sale.tableName) meta.push(`<div class="big">${escapeHtml(sale.tableName)}</div>`);
  if (sale.waiterName) meta.push(`<div>Waiter: ${escapeHtml(sale.waiterName)}</div>`);

  const items = sale.items
    .map(
      (item) =>
        `<tr><td class="qty">${item.qty}×</td><td>${escapeHtml(item.productName)}</td></tr>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${escapeHtml(
    sale.receiptNo
  )}</title><style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
body { width: ${contentWidth}mm; margin: 0 auto; padding: 2mm 0; font-family: "Courier New", monospace;
  font-size: ${fontSize}; line-height: 1.3; color: #000; }
.title { font-weight: bold; font-size: ${width <= 58 ? '13px' : '16px'}; }
.big { font-weight: bold; font-size: ${width <= 58 ? '13px' : '16px'}; }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; border-top: 1px dashed #000; }
td { padding: 1px 0; vertical-align: top; }
.qty { width: 8mm; font-weight: bold; }
</style></head><body>
<div>${meta.join('')}</div>
<table><tbody>${items}</tbody></table>
</body></html>`;
}

/** Small fake sale used by the Settings "Test print" button. */
export function sampleTestSale(business: BusinessProfile | null): SaleDetail {
  const now = new Date().toISOString();
  return {
    id: 'test',
    receiptNo: 'TEST-0001',
    locationName: 'Main store',
    cashierName: 'Test print',
    status: 'completed',
    totalKobo: 150000,
    amountPaidKobo: 150000,
    tableName: null,
    orderType: 'dine_in',
    waiterName: 'Test print',
    serviceChargeKobo: 0,
    tipKobo: 0,
    createdAt: now,
    itemCount: 2,
    locationId: 'test',
    cashierId: null,
    subtotalKobo: 150000,
    lineDiscountKobo: 0,
    headerDiscountKobo: 0,
    taxKobo: 0,
    changeKobo: 0,
    tableId: null,
    items: [
      {
        id: 'a',
        productId: 'p1',
        productName: 'Sample product',
        sku: 'SAMPLE-1',
        qty: 2,
        unitPriceKobo: 50000,
        lineDiscountKobo: 0,
        lineTotalKobo: 100000,
      },
      {
        id: 'b',
        productId: 'p2',
        productName: business?.name ? `Welcome to ${business.name}` : 'Second sample item',
        sku: null,
        qty: 1,
        unitPriceKobo: 50000,
        lineDiscountKobo: 0,
        lineTotalKobo: 50000,
      },
    ],
    customerId: null,
    customerName: null,
    externalRef: null,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscountKobo: 0,
    loyaltyPointsEarned: 0,
    payments: [{ id: 'pay', method: 'cash', amountKobo: 150000, reference: '' }],
    returns: [],
    reversal: null,
  };
}
