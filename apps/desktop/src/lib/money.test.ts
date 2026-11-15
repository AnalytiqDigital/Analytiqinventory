import { describe, expect, it } from 'vitest';
import { formatKobo, parseNairaToKobo } from './money';

describe('money helpers', () => {
  it('formats kobo as naira', () => {
    expect(formatKobo(45000)).toBe('₦450.00');
    expect(formatKobo(0)).toBe('₦0.00');
  });

  it('parses naira strings to kobo', () => {
    expect(parseNairaToKobo('450')).toBe(45000);
    expect(parseNairaToKobo('1,250.50')).toBe(125050);
    expect(parseNairaToKobo('₦ 99.9')).toBe(9990);
  });

  it('rejects invalid amounts', () => {
    expect(parseNairaToKobo('')).toBeNull();
    expect(parseNairaToKobo('abc')).toBeNull();
    expect(parseNairaToKobo('-5')).toBeNull();
    expect(parseNairaToKobo('10.999')).toBeNull();
  });
});
