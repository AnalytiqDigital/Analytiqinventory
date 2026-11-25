import { createPrivateKey } from 'node:crypto';
import { findLicensePlan, findPromotion, type LicensePlan } from '@analytiq/validation';
import { issueLicense } from '@analytiq/licensing/dist/key';
import type { OrderView } from '../types';
import { PaymentError, type PaystackTransaction } from './paystack';

export interface IssuedOrder {
  order: OrderView;
  licenseKey: string;
}

function metadataOf(transaction: PaystackTransaction): Record<string, unknown> {
  let raw = transaction.metadata;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function orderReference(transaction: PaystackTransaction): string {
  return text(metadataOf(transaction).order_reference);
}

/** Only transactions started by this checkout carry our reference in metadata. */
export function isAnalytiqTransaction(transaction: PaystackTransaction): boolean {
  return orderReference(transaction) === transaction.reference;
}

export function planOf(transaction: PaystackTransaction): LicensePlan | undefined {
  return findLicensePlan(text(metadataOf(transaction).plan));
}

export interface AmountBreakdown {
  originalAmountKobo: number;
  discountKobo: number;
  discountCode: string;
  amountKobo: number;
}

function positiveKobo(value: unknown): number | undefined {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.trunc(amount) : undefined;
}

/**
 * Recompute the total from the metadata this server sent to Paystack. A bad
 * code or altered discount means the order was tampered with.
 */
export function amountBreakdown(
  transaction: PaystackTransaction,
  plan: LicensePlan
): AmountBreakdown {
  const meta = metadataOf(transaction);
  const discountCode = text(meta.discountCode).toUpperCase();
  const recordedOriginal = positiveKobo(meta.originalAmountKobo);
  const recordedAmount = positiveKobo(meta.amountKobo);
  const originalAmountKobo = recordedOriginal ?? recordedAmount ?? plan.priceKobo;

  if (discountCode) {
    const promotion = findPromotion(discountCode);
    const recordedDiscount = positiveKobo(meta.discountKobo) ?? 0;
    if (!promotion || recordedDiscount !== promotion.amountKobo) {
      throw new PaymentError('The paid amount does not match the order', 400, 'AMOUNT_MISMATCH');
    }
    const amountKobo = Math.max(0, originalAmountKobo - promotion.amountKobo);
    if (recordedAmount !== undefined && recordedAmount !== amountKobo) {
      throw new PaymentError('The paid amount does not match the order', 400, 'AMOUNT_MISMATCH');
    }
    return { originalAmountKobo, discountKobo: promotion.amountKobo, discountCode, amountKobo };
  }

  const recordedDiscount = positiveKobo(meta.discountKobo) ?? 0;
  if (recordedDiscount > 0) {
    throw new PaymentError('The paid amount does not match the order', 400, 'AMOUNT_MISMATCH');
  }
  const amountKobo = recordedAmount ?? originalAmountKobo;
  return { originalAmountKobo, discountKobo: 0, discountCode: '', amountKobo };
}

function assertPaidAmount(transaction: PaystackTransaction, plan: LicensePlan): AmountBreakdown {
  if (transaction.currency !== 'NGN') {
    throw new PaymentError('This order is priced in NGN', 400, 'CURRENCY_MISMATCH');
  }
  const breakdown = amountBreakdown(transaction, plan);
  // Paystack may add its processing fee on top when the account passes fees to
  // the customer, so the transaction can be higher than the price we charged.
  // Anything below the price we computed is still a mismatch.
  if (transaction.amount < breakdown.amountKobo) {
    throw new PaymentError(
      `The paid amount does not match the order (paid ${transaction.amount} kobo, expected ${breakdown.amountKobo} kobo)`,
      400,
      'AMOUNT_MISMATCH'
    );
  }
  return breakdown;
}

/**
 * The key is derived from the Paystack transaction, not stored anywhere: the
 * same reference, business, plan and paid time always sign the same payload.
 * A missed webhook or a serverless cold start cannot lose or duplicate a key.
 */
export function issueFromTransaction(
  transaction: PaystackTransaction,
  privateKeyPem: string
): IssuedOrder {
  if (!isAnalytiqTransaction(transaction)) {
    throw new PaymentError('That order does not exist', 404, 'ORDER_NOT_FOUND');
  }
  const meta = metadataOf(transaction);
  const business = text(meta.business);
  if (!business) {
    throw new PaymentError(
      'This payment has no business name attached. Contact us on WhatsApp before paying again.',
      500,
      'ORDER_INCOMPLETE'
    );
  }
  const plan = planOf(transaction);
  if (!plan) {
    throw new PaymentError(
      'This payment has no AnalytIQ plan attached. Contact us on WhatsApp before paying again.',
      500,
      'ORDER_INCOMPLETE'
    );
  }
  const breakdown = assertPaidAmount(transaction, plan);
  if (!transaction.paid_at || !Number.isFinite(Date.parse(transaction.paid_at))) {
    throw new PaymentError(
      'Paystack has not recorded a payment time for this order yet.',
      409,
      'ORDER_INCOMPLETE'
    );
  }
  if (!privateKeyPem.trim()) {
    throw new PaymentError(
      'The license issuer has no private key configured',
      500,
      'LICENSE_KEY_MISSING'
    );
  }
  try {
    createPrivateKey(privateKeyPem);
  } catch {
    throw new PaymentError(
      'The configured license private key is not valid',
      500,
      'LICENSE_KEY_INVALID'
    );
  }

  const paidAt = new Date(transaction.paid_at).toISOString();
  const email = text(transaction.customer?.email) || text(meta.email);
  const recordedDays = Number(meta.licenceDays);
  const days = Number.isInteger(recordedDays) && recordedDays > 0 ? recordedDays : plan.days;
  const issued = issueLicense({
    business,
    plan: plan.id,
    days,
    id: `lic_${transaction.reference}`,
    now: new Date(paidAt),
    privateKeyPem,
  });

  return {
    licenseKey: issued.key,
    order: {
      reference: transaction.reference,
      planId: plan.id,
      planName: plan.name,
      business,
      name: text(meta.name),
      email,
      originalAmountKobo: breakdown.originalAmountKobo,
      discountKobo: breakdown.discountKobo,
      discountCode: breakdown.discountCode,
      amountKobo: breakdown.amountKobo,
      status: 'paid',
      licenseKey: issued.key,
      createdAt: transaction.transaction_date ?? paidAt,
      paidAt,
      expiresAt: issued.payload.expires,
    },
  };
}

/**
 * Read-only order view for the success page. Pending and failed payments never
 * touch the signing key.
 */
export function orderView(transaction: PaystackTransaction, privateKeyPem: string): OrderView {
  if (!isAnalytiqTransaction(transaction)) {
    throw new PaymentError('That order does not exist', 404, 'ORDER_NOT_FOUND');
  }
  if (transaction.status === 'success') {
    return issueFromTransaction(transaction, privateKeyPem).order;
  }
  const meta = metadataOf(transaction);
  const plan = findLicensePlan(text(meta.plan));
  if (!plan) {
    throw new PaymentError('That order does not exist', 404, 'ORDER_NOT_FOUND');
  }
  const failed = ['failed', 'reversed', 'abandoned'].includes(transaction.status);
  const breakdown = amountBreakdown(transaction, plan);
  return {
    reference: transaction.reference,
    planId: plan.id,
    planName: plan.name,
    business: text(meta.business),
    name: text(meta.name),
    email: text(transaction.customer?.email) || text(meta.email),
    originalAmountKobo: breakdown.originalAmountKobo,
    discountKobo: breakdown.discountKobo,
    discountCode: breakdown.discountCode,
    amountKobo: breakdown.amountKobo,
    status: failed ? 'failed' : 'pending',
    licenseKey: null,
    createdAt: transaction.transaction_date ?? '',
    paidAt: null,
    expiresAt: null,
  };
}

/** Key recovery: the reference is unguessable and the email must also match. */
export function retrieveFromTransaction(
  transaction: PaystackTransaction,
  privateKeyPem: string,
  email: string
): OrderView {
  const customerEmail = text(transaction.customer?.email).toLowerCase();
  if (
    !isAnalytiqTransaction(transaction) ||
    transaction.status !== 'success' ||
    !customerEmail ||
    customerEmail !== email.trim().toLowerCase()
  ) {
    throw new PaymentError(
      'We could not find a paid order with that reference and email',
      404,
      'ORDER_NOT_FOUND'
    );
  }
  return issueFromTransaction(transaction, privateKeyPem).order;
}
