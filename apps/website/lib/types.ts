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
  /** Catalogue price before any promotion, in kobo. */
  originalAmountKobo: number;
  /** Amount removed by an applied promotion, in kobo. */
  discountKobo: number;
  /** Normalised promotion code, or an empty string for a full-price order. */
  discountCode: string;
  /** Payable/paid amount in kobo. */
  amountKobo: number;
  status: 'pending' | 'paid' | 'failed';
  licenseKey: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Set by the built-in Vercel API from the signed key payload. */
  expiresAt?: string | null;
  delivery?: DeliveryRecord | null;
}
