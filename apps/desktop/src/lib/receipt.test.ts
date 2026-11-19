import { describe, expect, it } from 'vitest';
import { buildReceiptHtml, escapeHtml, sampleTestSale } from './receipt';
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
});
