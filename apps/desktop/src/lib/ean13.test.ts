import { describe, expect, it } from 'vitest';
import { ean13Checksum, ean13Modules, isValidEan13 } from './ean13';

describe('ean13', () => {
  it('computes the check digit', () => {
    expect(ean13Checksum('400638133393')).toBe(1);
    expect(ean13Checksum('40063813339')).toBeNull();
    expect(ean13Checksum('abcdefghijkl')).toBeNull();
  });

  it('validates whole codes', () => {
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
    expect(isValidEan13('400638133393')).toBe(false);
    expect(isValidEan13('400638133393a')).toBe(false);
  });

  it('encodes 95 modules with guards and the centre separator', () => {
    const modules = ean13Modules('4006381333931');
    expect(modules).toHaveLength(95);
    expect(modules?.slice(0, 3)).toBe('101');
    expect(modules?.slice(45, 50)).toBe('01010');
    expect(modules?.slice(92)).toBe('101');
    expect(modules).toMatch(/^[01]+$/);
    expect(ean13Modules('4006381333932')).toBeNull();
  });

  it('uses the leading digit to choose the left-hand parity pattern', () => {
    // 0 uses LLLLLL, so the first left digit (0) must read 0001101.
    const leadingZero = ean13Modules('0000000000000');
    expect(leadingZero?.slice(3, 10)).toBe('0001101');
    // 9 uses LGGLGL, so the second left digit (0) is a G pattern: 0100111.
    const leadingNine = ean13Modules('9000000000001');
    expect(leadingNine?.slice(10, 17)).toBe('0100111');
  });
});
