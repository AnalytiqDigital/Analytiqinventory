import { describe, expect, it } from 'vitest';
import { buildKitchenTicketHtml, buildReceiptHtml, escapeHtml, sampleTestSale } from './receipt';
import type { BusinessProfile } from '../types/global';

const BUSINESS: BusinessProfile = {
  id: 'b1',
  name: 'Ada & Sons <Store>',
  type: 'retail',
  address: '12 Market Road',
  phone: '0800 000 0000',
  email: 'shop@example.com',
  state: 'Lagos',
  lga: 'Ikeja',
  currency: 'NGN',
  taxLabel: 'VAT',
  taxRateBps: 750,
};

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml('<b>"x" & \'y\'</b>')).toBe(
      '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;'
    );
  });
});

describe('buildReceiptHtml', () => {
  it('renders business header, receipt number and total', () => {
    const html = buildReceiptHtml(sampleTestSale(BUSINESS), BUSINESS);
    expect(html).toContain('Ada &amp; Sons &lt;Store&gt;');
    expect(html).toContain('12 Market Road');
    expect(html).toContain('TEST-0001');
    expect(html).toContain('₦1,500.00');
    expect(html).toContain('Thank you for your patronage!');
  });

  it('uses the selected roll width', () => {
    const narrow = buildReceiptHtml(sampleTestSale(BUSINESS), BUSINESS, { widthMm: 58 });
    expect(narrow).toContain('@page { size: 58mm auto; margin: 0; }');
    expect(narrow).toContain('width: 54mm');
    const wide = buildReceiptHtml(sampleTestSale(BUSINESS), BUSINESS, { widthMm: 80 });
    expect(wide).toContain('@page { size: 80mm auto; margin: 0; }');
  });

  it('escapes product names and never emits raw user markup', () => {
    const sale = sampleTestSale(BUSINESS);
    sale.items[0] = { ...sale.items[0]!, productName: '<script>alert(1)</script>' };
    const html = buildReceiptHtml(sale, BUSINESS);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('flags voided sales and skips zero-value lines', () => {
    const sale = sampleTestSale(BUSINESS);
    sale.status = 'voided';
    const html = buildReceiptHtml(sale, BUSINESS);
    expect(html).toContain('*** VOIDED ***');
    expect(html).not.toContain('Line discounts');
    expect(html).not.toContain('Change');
  });

  it('adds service charge, tip, order type and waiter for restaurant bills', () => {
    const sale = sampleTestSale(BUSINESS);
    sale.orderType = 'dine_in';
    sale.waiterName = 'Ada <Waitress>';
    sale.serviceChargeKobo = 7500;
    sale.tipKobo = 5000;
    const html = buildReceiptHtml(sale, BUSINESS);
    expect(html).toContain('Dine-in');
    expect(html).toContain('Waiter: Ada &lt;Waitress&gt;');
    expect(html).toContain('Service charge');
    expect(html).toContain('₦75.00');
    expect(html).toContain('Tip');
    expect(html).toContain('₦50.00');
  });
});

describe('buildKitchenTicketHtml', () => {
  it('lists quantities and names without prices', () => {
    const sale = sampleTestSale(BUSINESS);
    sale.orderType = 'dine_in';
    sale.tableName = 'Table 4';
    sale.waiterName = 'Ada';
    const html = buildKitchenTicketHtml(sale, { widthMm: 58 });
    expect(html).toContain('KITCHEN ORDER TICKET');
    expect(html).toContain('TEST-0001');
    expect(html).toContain('Table 4');
    expect(html).toContain('Waiter: Ada');
    expect(html).toContain('2×');
    expect(html).toContain('Sample product');
    expect(html).not.toContain('₦');
    expect(html).toContain('@page { size: 58mm auto; margin: 0; }');
  });
});
