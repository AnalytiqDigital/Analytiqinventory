export interface QuoteRequestValues {
  business: string;
  name: string;
  businessType: string;
  locations: string;
  tills: string;
  phone: string;
  email: string;
  notes: string;
}

export const LOCATION_COUNTS = [
  '2 locations',
  '3–5 locations',
  '6–10 locations',
  'More than 10 locations',
] as const;

export const TILLS_PER_LOCATION = [
  '1–2 tills per location',
  '3–5 tills per location',
  '6–10 tills per location',
  'More than 10 tills per location',
] as const;

export function buildQuoteMessage(values: Partial<QuoteRequestValues>): string {
  const lines = [
    'Hi AnalytIQ, I would like a quote for the cloud version (more than one location).',
    values.business?.trim() ? `Business: ${values.business.trim()}` : '',
    values.name?.trim() ? `Contact: ${values.name.trim()}` : '',
    values.businessType?.trim() ? `Business type: ${values.businessType.trim()}` : '',
    values.locations?.trim() ? `Locations: ${values.locations.trim()}` : '',
    values.tills?.trim() ? `Tills: ${values.tills.trim()}` : '',
    values.phone?.trim() ? `Phone: ${values.phone.trim()}` : '',
    values.email?.trim() ? `Email: ${values.email.trim()}` : '',
    values.notes?.trim() ? `Notes: ${values.notes.trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
