import { describe, expect, it } from 'vitest';
import { ApiError } from '../common/api-error';
import { PaystackClient, paystackSignature, verifyPaystackSignature } from './paystack';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const INPUT = {
  email: 'ada@example.com',
  amountKobo: 4_500_000,
  reference: 'ord_abc123',
  callbackUrl: 'https://shop.example/checkout/success',
  metadata: { plan: 'standard' },
};

describe('paystack client', () => {
  it('signs and verifies webhook bodies in constant time', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = paystackSignature(body, 'sk_test_123');
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyPaystackSignature(body, 'sk_test_123', signature)).toBe(true);
    expect(verifyPaystackSignature(body, 'sk_test_123', signature.toUpperCase())).toBe(false);
    expect(verifyPaystackSignature(body, 'sk_other', signature)).toBe(false);
    expect(
      verifyPaystackSignature(Buffer.from(body).toString() + ' ', 'sk_test_123', signature)
    ).toBe(false);
    expect(verifyPaystackSignature(body, 'sk_test_123', undefined)).toBe(false);
    expect(verifyPaystackSignature(body, 'sk_test_123', 'short')).toBe(false);
  });

  it('initialises a transaction with the order amount and reference', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = new PaystackClient('sk_test_123', (async (
      url: string | URL | Request,
      init?: RequestInit
    ) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc',
          access_code: 'abc',
        },
      });
    }) as typeof fetch);

    const result = await client.initialize(INPUT);
    expect(result).toEqual({
      authorizationUrl: 'https://checkout.paystack.com/abc',
      accessCode: 'abc',
    });

    expect(calls[0]?.url).toBe('https://api.paystack.co/transaction/initialize');
    expect(calls[0]?.init?.method).toBe('POST');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk_test_123');
    const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      email: 'ada@example.com',
      amount: 4_500_000,
      reference: 'ord_abc123',
      callback_url: 'https://shop.example/checkout/success',
    });
  });

  it('refuses to charge when no secret key is configured', async () => {
    const client = new PaystackClient('', () => Promise.reject(new Error('must not be called')));
    expect(client.configured).toBe(false);
    try {
      await client.initialize(INPUT);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).getStatus()).toBe(503);
      expect((err as ApiError).getResponse()).toMatchObject({ code: 'PAYSTACK_NOT_CONFIGURED' });
    }
  });

  it('surfaces Paystack refusals with the provider message', async () => {
    const client = new PaystackClient('sk_test_123', (async () =>
      jsonResponse({ status: false, message: 'Invalid email address' }, 400)) as typeof fetch);
    try {
      await client.initialize(INPUT);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).getStatus()).toBe(502);
      expect((err as ApiError).getResponse()).toMatchObject({
        code: 'PAYSTACK_ERROR',
        error: 'Paystack refused the payment: Invalid email address',
      });
    }
  });

  it('reports an unreachable provider distinctly', async () => {
    const client = new PaystackClient('sk_test_123', (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    try {
      await client.initialize(INPUT);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).getResponse()).toMatchObject({ code: 'PAYSTACK_UNREACHABLE' });
    }
  });
});
