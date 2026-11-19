import { describe, expect, it } from 'vitest';
import { formatDate, formatNaira } from './format';

describe('formatNaira', () => {
  it('drops decimals for whole-naira prices', () => {
    expect(formatNaira(2_500_000)).toBe('₦25,000');
    expect(formatNaira(8_500_000)).toBe('₦85,000');
  });

  it('keeps two decimals when the amount has kobo', () => {
    expect(formatNaira(1_234_567)).toBe('₦12,345.67');
    expect(formatNaira(490_050)).toBe('₦4,900.50');
  });

  it('handles zero and non-finite input', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(Number.NaN)).toBe('₦0');
  });
});

describe('formatDate', () => {
  it('formats an ISO timestamp for a Nigerian reader', () => {
    expect(formatDate('2026-11-18T12:00:00.000Z')).toMatch(/November 2026/);
  });

  it('shows a dash for missing or invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });
});
