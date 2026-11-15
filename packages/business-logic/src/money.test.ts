import { describe, expect, it } from 'vitest';
import { addKobo, applyPercentageDiscount } from './index';

describe('money helpers', () => {
  it('adds kobo amounts', () => {
    expect(addKobo(100, 250)).toBe(350);
  });
  it('applies percentage discounts', () => {
    expect(applyPercentageDiscount(1000, 10)).toBe(900);
  });
});
