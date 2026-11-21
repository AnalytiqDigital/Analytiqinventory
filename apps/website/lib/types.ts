import type { LicensePlanId } from '@analytiq/validation';

export interface DeliveryAttempt {
  state: 'sent' | 'failed' | 'skipped';
  at: string;
  detail?: string;
}

export interface DeliveryRecord {
  email?: DeliveryAttempt;
  whatsapp?: DeliveryAttempt;
}

export interface OrderView {
  reference: string;
  planId: LicensePlanId;
  planName: string;
  business: string;
  name: string;
  email: string;
  amountKobo: number;
  status: 'pending' | 'paid' | 'failed';
  licenseKey: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Set by the built-in Vercel API from the signed key payload. */
  expiresAt?: string | null;
  delivery?: DeliveryRecord | null;
}
