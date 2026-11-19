export interface DemoRequestValues {
  name: string;
  business: string;
  businessType: string;
  tills: string;
  branches: string;
  phone: string;
  email: string;
}

export const BUSINESS_TYPES = [
  'Provision store',
  'Pharmacy',
  'Boutique or fashion',
  'Electronics or phone shop',
  'Wholesaler',
  'Restaurant or bar',
  'Multi-branch business',
  'Other',
] as const;

export const TILL_COUNTS = ['1 till', '2–3 tills', '4 tills or more', 'Not sure yet'] as const;

export const BRANCH_COUNTS = [
  '1 location',
  '2–3 locations',
  '4 locations or more',
  'Not sure yet',
] as const;

export function buildDemoMessage(values: Partial<DemoRequestValues>): string {
  const lines = [
    'Hi AnalytIQ, I would like a free demo.',
    values.name?.trim() ? `Name: ${values.name.trim()}` : '',
    values.business?.trim() ? `Business: ${values.business.trim()}` : '',
    values.businessType?.trim() ? `Business type: ${values.businessType.trim()}` : '',
    values.tills?.trim() ? `Tills: ${values.tills.trim()}` : '',
    values.branches?.trim() ? `Locations: ${values.branches.trim()}` : '',
    values.phone?.trim() ? `Phone: ${values.phone.trim()}` : '',
    values.email?.trim() ? `Email: ${values.email.trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
