import { describe, expect, it } from 'vitest';
import { ScanBuffer } from './use-barcode-scanner';

describe('ScanBuffer', () => {
  it('returns the code when a fast burst ends with Enter', () => {
    const buffer = new ScanBuffer();
    let code: string | null = null;
    '1234567890'.split('').forEach((ch, index) => {
      code = buffer.push(ch, index * 10);
    });
    expect(buffer.push('Enter', 110)).toBe('1234567890');
    expect(code).toBeNull();
  });

  it('ignores slow human typing', () => {
    const buffer = new ScanBuffer();
    const keys = 'abcde';
    keys.split('').forEach((ch) => buffer.push(ch, 0));
    expect(buffer.push('Enter', 500)).toBeNull();
  });

  it('drops bursts shorter than the minimum length', () => {
    const buffer = new ScanBuffer();
    ['a', 'b'].forEach((ch, i) => buffer.push(ch, i * 5));
    expect(buffer.push('Enter', 15)).toBeNull();
  });

  it('forgets the scan when a gap exceeds the threshold', () => {
    const buffer = new ScanBuffer();
    buffer.push('1', 0);
    buffer.push('2', 5);
    buffer.push('3', 205);
    buffer.push('4', 210);
    buffer.push('5', 215);
    buffer.push('6', 220);
    expect(buffer.push('Enter', 225)).toBe('3456');
  });
});
