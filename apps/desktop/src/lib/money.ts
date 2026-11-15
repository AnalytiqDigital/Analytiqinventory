/** Format integer minor units (kobo) as Naira. Currency label comes from setup. */
export function formatKobo(kobo: number, currency = 'NGN'): string {
  const major = (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency.toUpperCase() === 'NGN') return `₦${major}`;
  return `${major} ${currency.toUpperCase()}`;
}

/** Parse a Naira string ("1,250.50") to integer kobo. Returns null if invalid. */
export function parseNairaToKobo(raw: string): number | null {
  const cleaned = raw.replace(/[,₦\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [naira, kobo = ''] = cleaned.split('.');
  const value = Number(naira) * 100 + Number((kobo + '00').slice(0, 2));
  if (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999) return null;
  return value;
}
