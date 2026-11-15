/** Pure money helpers. Amounts are integer minor units (kobo). */
export function addKobo(a: number, b: number): number {
  return a + b;
}

export function applyPercentageDiscount(amountKobo: number, percent: number): number {
  if (percent < 0 || percent > 100) throw new Error('percent must be 0-100');
  return Math.round((amountKobo * (100 - percent)) / 100);
}
