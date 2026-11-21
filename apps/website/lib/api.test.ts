import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutError, fetchOrder, retrieveKey, startCheckout, submitLead } from './api';

const ORDER = {
  reference: 'ord_abc123',
  planId: 'standard' as const,
  planName: 'AnalytIQ Inventory & POS',
  business: 'Ada Stores',
  name: 'Ada Obi',
  email: 'ada@example.com',
  amountKobo: 8_000_000,
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
      startCheckout({ plan: 'standard', business: 'Ada Stores', name: '', email: 'x', phone: '' })
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
      plan: 'standard',
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
        plan: 'standard',
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
    expect(calls[0]?.[0]).toBe('/api/checkout/ord%20with%20space');
    expect(order).toEqual(ORDER);
  });
});

describe('retrieveKey', () => {
  it('posts the reference and email and returns the recovered order', async () => {
    const paid = { ...ORDER, status: 'paid' as const, licenseKey: 'ANQ1.key' };
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, order: paid }));
    vi.stubGlobal('fetch', fetchMock);

    const order = await retrieveKey(' ord_abc123 ', 'ADA@example.com');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('/api/licence/retrieve');
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      reference: ' ord_abc123 ',
      email: 'ADA@example.com',
    });
    expect(order.licenseKey).toBe('ANQ1.key');
  });

  it('passes the server refusal through as a CheckoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'We could not find a paid order', code: 'ORDER_NOT_FOUND' }, 404)
      )
    );

    await expect(retrieveKey('ord_x', 'a@b.co')).rejects.toMatchObject({
      status: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });
});

describe('submitLead', () => {
  it('persists the lead with the form fields', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, id: 'lead_1' }));
    vi.stubGlobal('fetch', fetchMock);

    const id = await submitLead({
      kind: 'demo',
      name: 'Ada Obi',
      business: 'Ada Stores',
      businessType: 'Provision store',
      phone: '08139711767',
      email: 'ada@example.com',
      tills: '2 tills',
      branches: '1 branch',
      locations: '',
      notes: '',
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('/api/leads');
    expect(JSON.parse(String(calls[0]?.[1].body))).toMatchObject({
      kind: 'demo',
      name: 'Ada Obi',
      phone: '08139711767',
    });
    expect(id).toBe('lead_1');
  });
});
