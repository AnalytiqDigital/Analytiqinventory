import { createPrivateKey } from 'node:crypto';
import { findLicensePlan, type LicensePlan } from '@analytiq/validation';
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
  return findLicensePlan(text(metadataOf(transaction).plan) || 'standard');
}

export function expectedKobo(transaction: PaystackTransaction, plan: LicensePlan): number {
  const recorded = Number(metadataOf(transaction).amountKobo);
  return Number.isFinite(recorded) && recorded > 0 ? recorded : plan.priceKobo;
}

function assertPaidAmount(transaction: PaystackTransaction): LicensePlan {
  const meta = metadataOf(transaction);
  const plan = findLicensePlan(text(meta.plan));
  if (!plan) {
    throw new PaymentError(
      'This payment has no AnalytIQ plan attached. Contact us on WhatsApp before paying again.',
      500,
      'ORDER_INCOMPLETE'
    );
  }
  if (transaction.currency !== 'NGN') {
    throw new PaymentError('This order is priced in NGN', 400, 'CURRENCY_MISMATCH');
  }
  if (transaction.amount < expectedKobo(transaction, plan)) {
    throw new PaymentError('The paid amount does not match the order', 400, 'AMOUNT_MISMATCH');
  }
  return plan;
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
  const plan = assertPaidAmount(transaction);
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
      amountKobo: transaction.amount || expectedKobo(transaction, plan),
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
  const plan = findLicensePlan(text(meta.plan)) ?? findLicensePlan('standard');
  if (!plan) {
    throw new PaymentError('That order does not exist', 404, 'ORDER_NOT_FOUND');
  }
  const failed = ['failed', 'reversed', 'abandoned'].includes(transaction.status);
  return {
    reference: transaction.reference,
    planId: plan.id,
    planName: plan.name,
    business: text(meta.business),
    name: text(meta.name),
    email: text(transaction.customer?.email) || text(meta.email),
    amountKobo: transaction.amount || expectedKobo(transaction, plan),
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
