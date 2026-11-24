import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyLicenseKey } from '@analytiq/licensing/dist/key';
import {
  isAnalytiqTransaction,
  issueFromTransaction,
  orderView,
  retrieveFromTransaction,
} from './licences';
import type { PaystackTransaction } from './paystack';

const REF = `ord_${'a'.repeat(24)}`;
const PAID_AT = '2026-11-18T12:00:00.000Z';

const pair = generateKeyPairSync('ed25519');
const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function transaction(overrides: Partial<PaystackTransaction> = {}): PaystackTransaction {
  return {
    reference: REF,
    status: 'success',
    amount: 8_000_000,
    currency: 'NGN',
    paid_at: PAID_AT,
    transaction_date: '2026-11-18T11:59:00.000Z',
    customer: { email: 'ada@example.com' },
    metadata: {
      order_reference: REF,
      plan: 'standard',
      business: 'Ada Stores',
      name: 'Ada Obi',
      email: 'ada@example.com',
      amountKobo: 8_000_000,
    },
    ...overrides,
  };
}

describe('licences derived from a paid transaction', () => {
  it('signs the same verifiable key every time the transaction is read', () => {
    const first = issueFromTransaction(transaction(), privateKeyPem);
    const second = issueFromTransaction(transaction(), privateKeyPem);

    expect(first.licenseKey).toBe(second.licenseKey);
    expect(first.licenseKey.startsWith('ANQ1.')).toBe(true);

    const check = verifyLicenseKey(first.licenseKey, publicKeyPem);
    expect(check.valid).toBe(true);
    expect(check.payload).toMatchObject({
      id: `lic_${REF}`,
      business: 'Ada Stores',
      plan: 'standard',
      issued: PAID_AT,
      expires: '2027-11-18T12:00:00.000Z',
      device: null,
    });
    expect(first.order).toMatchObject({
      reference: REF,
      status: 'paid',
      planName: 'AnalytIQ Inventory & POS',
      amountKobo: 8_000_000,
      paidAt: PAID_AT,
      licenseKey: first.licenseKey,
      expiresAt: '2027-11-18T12:00:00.000Z',
    });
  });

  it('shows pending and failed orders without touching the signing key', () => {
    const pending = orderView(
      transaction({ status: 'ongoing', paid_at: null, transaction_date: null }),
      ''
    );
    expect(pending).toMatchObject({ status: 'pending', licenseKey: null, paidAt: null });

    const failed = orderView(transaction({ status: 'abandoned', paid_at: null }), '');
    expect(failed.status).toBe('failed');
    expect(failed.licenseKey).toBeNull();
  });

  it('rejects underpayment, foreign currency and missing order metadata', () => {
    expect(() =>
      issueFromTransaction(transaction({ amount: 7_999_999 }), privateKeyPem)
    ).toThrowError(/does not match/);
    expect(() =>
      issueFromTransaction(transaction({ currency: 'USD' }), privateKeyPem)
    ).toThrowError(/NGN/);
    expect(() =>
      issueFromTransaction(
        transaction({ metadata: { order_reference: REF, business: 'Ada Stores' } }),
        privateKeyPem
      )
    ).toThrowError(/no AnalytIQ plan/);
    expect(() =>
      issueFromTransaction(
        transaction({ metadata: { order_reference: REF, plan: 'standard' } }),
        privateKeyPem
      )
    ).toThrowError(/no business name/);
  });

  it('ignores payments that were not started by this checkout', () => {
    const foreign = transaction({
      metadata: { order_reference: 'ord_someone_else', plan: 'standard' },
    });
    expect(isAnalytiqTransaction(foreign)).toBe(false);
    expect(() => issueFromTransaction(foreign, privateKeyPem)).toThrowError(/does not exist/);
  });

  it('fails loudly when the issuer key is missing or malformed', () => {
    expect(() => issueFromTransaction(transaction(), '')).toThrowError(/no private key/);
    expect(() => issueFromTransaction(transaction(), 'not-a-pem')).toThrowError(/not valid/);
  });

  it('only recovers a key when the checkout email also matches', () => {
    expect(retrieveFromTransaction(transaction(), privateKeyPem, 'ADA@example.com')).toMatchObject({
      status: 'paid',
      reference: REF,
    });
    expect(() =>
      retrieveFromTransaction(transaction(), privateKeyPem, 'someone@example.com')
    ).toThrowError(/could not find/);
    expect(() =>
      retrieveFromTransaction(transaction({ status: 'failed' }), privateKeyPem, 'ada@example.com')
    ).toThrowError(/could not find/);
  });

  it('uses the lifetime recorded at checkout, not the current catalogue', () => {
    const older = transaction({
      metadata: {
        order_reference: REF,
        plan: 'standard',
        business: 'Ada Stores',
        name: '',
        email: 'ada@example.com',
        amountKobo: 8_000_000,
        licenceDays: 30,
      },
    });
    expect(issueFromTransaction(older, privateKeyPem).order.expiresAt).toBe(
      '2026-12-18T12:00:00.000Z'
    );
  });

  it('accepts the amount recorded at checkout if the catalogue price changes', () => {
    const older = transaction({
      amount: 7_500_000,
      metadata: {
        order_reference: REF,
        plan: 'standard',
        business: 'Ada Stores',
        name: '',
        email: 'ada@example.com',
        amountKobo: 7_500_000,
      },
    });
    expect(issueFromTransaction(older, privateKeyPem).order.amountKobo).toBe(7_500_000);
  });
  function discountedTransaction(
    overrides: Partial<PaystackTransaction> = {}
  ): PaystackTransaction {
    return transaction({
      amount: 6_000_000,
      metadata: {
        order_reference: REF,
        plan: 'standard',
        business: 'Ada Stores',
        name: 'Ada Obi',
        email: 'ada@example.com',
        originalAmountKobo: 8_000_000,
        discountKobo: 2_000_000,
        discountCode: 'SAVE20000',
        amountKobo: 6_000_000,
      },
      ...overrides,
    });
  }

  it('accepts SAVE20000 only at the exact discounted price', () => {
    const issued = issueFromTransaction(discountedTransaction(), privateKeyPem);
    expect(issued.order).toMatchObject({
      originalAmountKobo: 8_000_000,
      discountKobo: 2_000_000,
      discountCode: 'SAVE20000',
      amountKobo: 6_000_000,
    });
  });

  it('refuses underpayment, overpayment, bad codes and tampered discounts', () => {
    expect(() =>
      issueFromTransaction(discountedTransaction({ amount: 5_999_999 }), privateKeyPem)
    ).toThrowError(/does not match/);
    expect(() =>
      issueFromTransaction(discountedTransaction({ amount: 6_000_001 }), privateKeyPem)
    ).toThrowError(/does not match/);
    expect(() =>
      issueFromTransaction(
        discountedTransaction({
          metadata: {
            order_reference: REF,
            plan: 'standard',
            business: 'Ada Stores',
            originalAmountKobo: 8_000_000,
            discountKobo: 2_000_000,
            discountCode: 'NOPE',
            amountKobo: 6_000_000,
          },
        }),
        privateKeyPem
      )
    ).toThrowError(/does not match/);
    expect(() =>
      issueFromTransaction(
        discountedTransaction({
          metadata: {
            order_reference: REF,
            plan: 'standard',
            business: 'Ada Stores',
            originalAmountKobo: 8_000_000,
            discountKobo: 3_000_000,
            discountCode: 'SAVE20000',
            amountKobo: 6_000_000,
          },
        }),
        privateKeyPem
      )
    ).toThrowError(/does not match/);
  });
});
