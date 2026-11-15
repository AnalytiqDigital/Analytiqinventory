import { describe, expect, it } from 'vitest';
import {
  productSchema,
  productUpdateSchema,
  stockAdjustSchema,
  stockCountSchema,
} from './index';

describe('batch 4 inventory validation', () => {
  it('accepts a full product payload', () => {
    const parsed = productSchema.parse({
      name: 'Indomie 70g',
      sku: 'IND-70',
      barcode: '  ',
      unit: 'pcs',
      costPriceKobo: 32000,
      sellingPriceKobo: 45000,
      reorderLevel: 10,
      openingStock: 100,
    });
    expect(parsed.sku).toBe('IND-70');
    // Blank barcode collapses to null so uniqueness checks ignore it.
    expect(parsed.barcode).toBeNull();
  });

  it('rejects negative prices and blank names', () => {
    expect(() => productSchema.parse({ name: 'x', costPriceKobo: -1 })).toThrow();
    expect(() => productSchema.parse({ name: ' ', sellingPriceKobo: 10 })).toThrow();
  });

  it('update schema is fully partial (no opening stock)', () => {
    const parsed = productUpdateSchema.parse({ sellingPriceKobo: 90000 });
    expect(parsed).toEqual({ sellingPriceKobo: 90000 });
  });

  it('adjustment requires a non-zero delta and a reason', () => {
    expect(() =>
      stockAdjustSchema.parse({ productId: 'prd_x', quantityDelta: 0, reason: 'oops' }),
    ).toThrow();
    expect(() =>
      stockAdjustSchema.parse({ productId: 'prd_x', quantityDelta: 5, reason: 'ok' }),
    ).toThrow();
  });

  it('count requires a non-negative counted quantity', () => {
    expect(() =>
      stockCountSchema.parse({ productId: 'prd_x', countedQty: -1 }),
    ).toThrow();
    const parsed = stockCountSchema.parse({ productId: 'prd_x', countedQty: 33 });
    expect(parsed.countedQty).toBe(33);
  });
});
