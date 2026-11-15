import { describe, expect, it } from 'vitest';
import { saleCreateSchema, saleRefundSchema, salesQuerySchema } from './index';

describe('batch 5 POS validation', () => {
  it('accepts a cash sale with line + header discounts', () => {
    const parsed = saleCreateSchema.parse({
      items: [{ productId: 'prd_1', qty: 2, lineDiscountKobo: 500 }],
      headerDiscountKobo: 1000,
      payments: [{ method: 'cash', amountKobo: 90000 }],
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.headerDiscountKobo).toBe(1000);
  });

  it('accepts split tender across all four methods', () => {
    const parsed = saleCreateSchema.parse({
      items: [{ productId: 'prd_1', qty: 1 }],
      payments: [
        { method: 'cash', amountKobo: 10000 },
        { method: 'transfer', amountKobo: 20000, reference: 'TRF-1' },
        { method: 'pos', amountKobo: 15000, reference: 'POS-9' },
        { method: 'credit', amountKobo: 3375 },
      ],
    });
    expect(parsed.payments).toHaveLength(4);
  });

  it('rejects empty carts, zero payments, and bad methods', () => {
    expect(() =>
      saleCreateSchema.parse({ items: [], payments: [{ method: 'cash', amountKobo: 100 }] }),
    ).toThrow();
    expect(() =>
      saleCreateSchema.parse({
        items: [{ productId: 'prd_1', qty: 1 }],
        payments: [{ method: 'cash', amountKobo: 0 }],
      }),
    ).toThrow();
    expect(() =>
      saleCreateSchema.parse({
        items: [{ productId: 'prd_1', qty: 1 }],
        payments: [{ method: 'crypto', amountKobo: 100 }],
      }),
    ).toThrow();
  });

  it('refund requires a real reason', () => {
    expect(() => saleRefundSchema.parse({ reason: 'ok' })).toThrow();
    expect(saleRefundSchema.parse({ reason: 'Customer return' }).reason).toBe('Customer return');
  });

  it('sales query defaults page and pageSize', () => {
    const q = salesQuerySchema.parse({});
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(50);
  });
});
