import { describe, expect, it } from 'vitest';
import {
  PaymentError,
  PaystackClient,
  paystackSignature,
  verifyPaystackSignature,
} from './paystack';

const INPUT = {
  email: 'ada@example.com',
  amountKobo: 8_000_000,
  reference: 'ord_abc123',
  callbackUrl: 'https://shop.example/checkout/success',
  metadata: { plan: 'standard' },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('paystack signatures', () => {
  it('accepts only the exact HMAC-SHA512 body', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = paystackSignature(body, 'sk_test_123');
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyPaystackSignature(body, 'sk_test_123', signature)).toBe(true);
    expect(verifyPaystackSignature(body, 'sk_test_123', signature.toUpperCase())).toBe(false);
    expect(verifyPaystackSignature(body, 'sk_other', signature)).toBe(false);
    expect(verifyPaystackSignature(Buffer.from(body).toString() + ' ', 'sk_test_123', signature)).toBe(
      false
    );
    expect(verifyPaystackSignature(body, 'sk_test_123', undefined)).toBe(false);
    expect(verifyPaystackSignature(body, 'sk_test_123', 'short')).toBe(false);
  });
});

describe('PaystackClient', () => {
  it('initialises a transaction with the catalogue amount and order reference', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new PaystackClient('sk_test_123', (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/abc' },
      });
    }) as typeof fetch);

    const result = await client.initialize(INPUT);
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc');
    expect(calls[0]?.url).toBe('https://api.paystack.co/transaction/initialize');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk_test_123');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      email: 'ada@example.com',
      amount: 8_000_000,
      reference: 'ord_abc123',
      callback_url: 'https://shop.example/checkout/success',
    });
  });

  it('reads a successful transaction back for key derivation', async () => {
    const client = new PaystackClient('sk_test_123', (async () =>
      jsonResponse({
        status: true,
        data: {
          reference: 'ord_abc123',
          status: 'success',
          amount: 8_000_000,
          currency: 'NGN',
          paid_at: '2026-11-18T12:00:00.000Z',
          transaction_date: '2026-11-18T11:59:00.000Z',
          customer: { email: 'ada@example.com' },
          metadata: { order_reference: 'ord_abc123' },
        },
      })) as typeof fetch);

    expect(await client.verify('ord_abc123')).toMatchObject({
      reference: 'ord_abc123',
      status: 'success',
      amount: 8_000_000,
      currency: 'NGN',
      paid_at: '2026-11-18T12:00:00.000Z',
      customer: { email: 'ada@example.com' },
      metadata: { order_reference: 'ord_abc123' },
    });
  });

  it('returns null when Paystack does not know the reference', async () => {
    const client = new PaystackClient('sk_test_123', (async () =>
      jsonResponse({ status: false, message: 'Transaction not found' }, 404)) as typeof fetch);
    expect(await client.verify('ord_missing')).toBeNull();
  });

  it('refuses to charge without a secret key', async () => {
    const client = new PaystackClient('', () => Promise.reject(new Error('must not be called')));
    expect(client.configured).toBe(false);
    await expect(client.initialize(INPUT)).rejects.toMatchObject({
      status: 503,
      code: 'PAYSTACK_NOT_CONFIGURED',
    });
  });

  it('surfaces provider refusals and outages distinctly', async () => {
    const refused = new PaystackClient('sk_test_123', (async () =>
      jsonResponse({ status: false, message: 'Invalid email address' }, 400)) as typeof fetch);
    await expect(refused.initialize(INPUT)).rejects.toMatchObject({
      status: 502,
      code: 'PAYSTACK_ERROR',
      message: 'Paystack refused the payment: Invalid email address',
    });

    const offline = new PaystackClient('sk_test_123', (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    const error = await offline.initialize(INPUT).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PaymentError);
    expect(error).toMatchObject({ status: 502, code: 'PAYSTACK_UNREACHABLE' });
  });

  it('verifies webhook bodies with the configured key only', () => {
    const raw = Buffer.from('{"event":"charge.success"}');
    const signature = paystackSignature(raw, 'sk_test_123');
    expect(new PaystackClient('sk_test_123').verifyWebhook(raw, signature)).toBe(true);
    expect(new PaystackClient('sk_live_other').verifyWebhook(raw, signature)).toBe(false);
  });
});
