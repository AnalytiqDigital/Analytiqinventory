// EAN-13 encoding for shelf labels. Pure module: no DOM, easy to unit test.

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

export function ean13Checksum(firstTwelve: string): number | null {
  if (!/^\d{12}$/.test(firstTwelve)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(firstTwelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13Checksum(code.slice(0, 12)) === Number(code[12]);
}

/** 95-module bit string, or null when the code is not a valid EAN-13. */
export function ean13Modules(code: string): string | null {
  if (!isValidEan13(code)) return null;
  const digits = code.split('').map(Number);
  const first = digits[0] ?? 0;
  const parity = PARITY[first] ?? 'LLLLLL';
  let left = '';
  for (let i = 0; i < 6; i += 1) {
    const digit = digits[i + 1] ?? 0;
    left += parity[i] === 'G' ? G[digit] : L[digit];
  }
  let right = '';
  for (let i = 7; i < 13; i += 1) {
    right += R[digits[i] ?? 0];
  }
  return `101${left}01010${right}101`;
}
