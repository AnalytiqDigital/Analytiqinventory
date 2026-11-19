import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutError, fetchOrder, startCheckout } from './api';

const ORDER = {
  reference: 'ord_abc123',
  planId: 'standard' as const,
  planName: 'Standard',
  business: 'Ada Stores',
  name: 'Ada Obi',
  email: 'ada@example.com',
  amountKobo: 4_500_000,
  status: 'pending' as const,
  licenseKey: null,
  createdAt: '2026-11-18T12:00:00.000Z',
  paidAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('startCheckout', () => {
  it('posts the checkout form to the configured API and returns the redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true, order: ORDER, authorizationUrl: 'https://pay.test/abc' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await startCheckout({
      plan: 'standard',
      business: 'Ada Stores',
      name: 'Ada Obi',
      email: 'ada@example.com',
      phone: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/checkout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ plan: 'standard' });
    expect(result.authorizationUrl).toBe('https://pay.test/abc');
  });

  it('surfaces the API error message and code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ ok: false, error: 'Enter a valid email', code: 'VALIDATION' }, 400)
      )
    );

    await expect(
      startCheckout({ plan: 'pro', business: 'Ada Stores', name: '', email: 'x', phone: '' })
    ).rejects.toMatchObject({ message: 'Enter a valid email', code: 'VALIDATION', status: 400 });
  });

  it('reports an unreachable server as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const error = await startCheckout({
      plan: 'pro',
      business: 'Ada Stores',
      name: '',
      email: 'ada@example.com',
      phone: '',
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CheckoutError);
    expect(error).toMatchObject({ code: 'NETWORK', status: 0 });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>oops</html>', { status: 502 }))
    );

    await expect(
      startCheckout({
        plan: 'starter',
        business: 'Ada Stores',
        name: '',
        email: 'a@b.co',
        phone: '',
      })
    ).rejects.toMatchObject({ message: 'Something went wrong. Please try again.', status: 502 });
  });
});

describe('fetchOrder', () => {
  it('encodes the reference and unwraps the order', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, order: ORDER }));
    vi.stubGlobal('fetch', fetchMock);

    const order = await fetchOrder('ord with space');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('http://localhost:3002/api/checkout/ord%20with%20space');
    expect(order).toEqual(ORDER);
  });
});
