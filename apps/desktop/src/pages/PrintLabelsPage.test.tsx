import { describe, expect, it } from 'vitest';
import type { ProductRow } from '../types/global';
import { barcodeSvg, labelHtml, labelsDocument } from './PrintLabelsPage';

const product: ProductRow = {
  id: 'prd_1',
  name: 'Indomie 70g <hot>',
  sku: 'IND-70',
  barcode: '4006381333931',
  categoryId: null,
  categoryName: 'Noodles',
  brandId: null,
  brandName: null,
  warrantyId: null,
  warrantyName: null,
  unit: 'pcs',
  costPriceKobo: 32_000,
  sellingPriceKobo: 45_000,
  reorderLevel: 10,
  imagePath: '',
  taxCategoryId: null,
  trackBatches: false,
  nearExpiryDays: 0,
  isActive: 1,
  onHand: 20,
  lowStock: false,
};

describe('barcodeSvg', () => {
  it('draws 95 modules for a valid EAN-13', () => {
    const svg = barcodeSvg('4006381333931');
    expect(svg).toContain('viewBox="0 0 95 40"');
    expect(svg.match(/<rect /g)?.length).toBeGreaterThan(30);
  });

  it('returns nothing for a code that is not EAN-13', () => {
    expect(barcodeSvg('SKU-1')).toBe('');
    expect(barcodeSvg('')).toBe('');
  });
});

describe('labelHtml', () => {
  it('escapes the name and shows the price in the business currency', () => {
    const html = labelHtml(product, 'Test Mart', 'NGN');
    expect(html).toContain('Test Mart');
    expect(html).toContain('Indomie 70g &lt;hot&gt;');
    expect(html).not.toContain('<hot>');
    expect(html).toContain('₦450.00');
    expect(html).toContain('4006381333931');
    expect(html).toContain('<svg');
  });

  it('shows a plain code when the barcode is not EAN-13', () => {
    const html = labelHtml({ ...product, barcode: 'ABC-123' }, 'Test Mart', 'NGN');
    expect(html).not.toContain('<svg');
    expect(html).toContain('ABC-123');
  });

  it('leaves the barcode block blank when the product has no barcode', () => {
    const html = labelHtml({ ...product, barcode: null }, 'Test Mart', 'NGN');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&nbsp;');
  });
});

describe('labelsDocument', () => {
  it('wraps labels in an A4 sheet with print-size labels', () => {
    const doc = labelsDocument(labelHtml(product, 'Test Mart', 'NGN'));
    expect(doc).toContain('@page { size: A4');
    expect(doc).toContain('width: 50mm');
    expect(doc).toContain('class="sheet"');
    expect(doc).toContain('Indomie 70g');
  });
});
