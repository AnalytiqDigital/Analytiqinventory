/**
 * Formats an integer kobo amount as Naira. Whole-Naira prices read cleanly on
 * the pricing table; anything with kobo keeps two decimals.
 */
export function formatNaira(kobo: number): string {
  if (!Number.isFinite(kobo)) return '₦0';
  const naira = kobo / 100;
  const fractionDigits = Number.isInteger(naira) ? 0 : 2;
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
