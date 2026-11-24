import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueLicense, verifyLicenseKey } from '@analytiq/licensing/dist/key';
import { GET as getHealth } from '../../app/health/route';
import * as checkoutRoute from '../../app/api/checkout/route';
import * as statusRoute from '../../app/api/checkout/[reference]/route';
import * as activateRoute from '../../app/api/licence/activate/route';
import * as deactivateRoute from '../../app/api/licence/deactivate/route';
import * as retrieveRoute from '../../app/api/licence/retrieve/route';
import * as webhookRoute from '../../app/api/payments/paystack/webhook/route';
import { paystackSignature, type PaystackTransaction } from './paystack';

const SECRET = 'sk_test_routes';
const APPS_URL = 'https://script.google.com/macros/s/abc/exec';
const REF = `ord_${'b'.repeat(24)}`;

const pair = generateKeyPairSync('ed25519');
const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function transaction(overrides: Partial<PaystackTransaction> = {}): PaystackTransaction {
  return {
    reference: REF,
    status: 'success',
    amount: 8_000_000,
    currency: 'NGN',
    paid_at: '2026-11-18T12:00:00.000Z',
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

function stubPaystack(data: PaystackTransaction, calls: Call[] = []): Call[] {
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/transaction/initialize')) {
      return Response.json({
        status: true,
        data: { authorization_url: 'https://checkout.paystack.test/abc' },
      });
    }
    if (url.includes('/transaction/verify/')) {
      return Response.json({ status: true, data });
    }
    if (url === APPS_URL) {
      return new Response('', { status: 302 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch);
  return calls;
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Vercel checkout routes', () => {
  it('starts a Paystack payment with the order details in metadata', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('WEBSITE_URL', 'https://shop.example');
    const calls = stubPaystack(transaction());

    const response = await checkoutRoute.POST(
      jsonRequest('https://shop.example/api/checkout', {
        plan: 'standard',
        business: 'Ada Stores',
        name: 'Ada Obi',
        email: 'ada@example.com',
        phone: '08139711767',
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authorizationUrl: string;
      order: { reference: string; status: string; licenseKey: null };
    };
    expect(body.authorizationUrl).toBe('https://checkout.paystack.test/abc');
    expect(body.order.reference).toMatch(/^ord_[0-9a-f]{24}$/);
    expect(body.order).toMatchObject({ status: 'pending', licenseKey: null });

    const init = calls.find((call) => call.url.endsWith('/transaction/initialize'));
    expect(JSON.parse(String(init?.init?.body))).toMatchObject({
      email: 'ada@example.com',
      amount: 8_000_000,
      reference: body.order.reference,
      callback_url: 'https://shop.example/checkout/success',
      metadata: {
        order_reference: body.order.reference,
        plan: 'standard',
        business: 'Ada Stores',
        amountKobo: 8_000_000,
        licenceDays: 365,
      },
    });
  });

  it('returns a verifiable key once Paystack reports success', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('LICENSE_PRIVATE_KEY', privateKeyPem);
    stubPaystack(transaction());

    const response = await statusRoute.GET(
      new Request(`https://shop.example/api/checkout/${REF}`),
      {
        params: { reference: REF },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      order: { status: string; licenseKey: string };
    };
    expect(body.order.status).toBe('paid');
    expect(verifyLicenseKey(body.order.licenseKey, publicKeyPem).valid).toBe(true);
  });

  it('rejects malformed references without calling Paystack', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    const calls = stubPaystack(transaction());

    const response = await statusRoute.GET(new Request('https://shop.example/api/checkout/nope'), {
      params: { reference: 'nope' },
    });
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('recovers a key only when reference and email both match', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('LICENSE_PRIVATE_KEY', privateKeyPem);
    stubPaystack(transaction());

    const wrong = await retrieveRoute.POST(
      jsonRequest('https://shop.example/api/licence/retrieve', {
        reference: REF,
        email: 'someone@example.com',
      })
    );
    expect(wrong.status).toBe(404);

    const right = await retrieveRoute.POST(
      jsonRequest('https://shop.example/api/licence/retrieve', {
        reference: REF,
        email: 'ADA@example.com',
      })
    );
    expect(right.status).toBe(200);
    const body = (await right.json()) as { order: { licenseKey: string } };
    expect(verifyLicenseKey(body.order.licenseKey, publicKeyPem).valid).toBe(true);
  });

  it('acknowledges a signed webhook, issues the key and emails it', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('LICENSE_PRIVATE_KEY', privateKeyPem);
    vi.stubEnv('WEBSITE_URL', 'https://shop.example');
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'shared-secret');
    const calls = stubPaystack(transaction());

    const raw = JSON.stringify({
      event: 'charge.success',
      data: { reference: REF, amount: 8_000_000, currency: 'NGN' },
    });
    const response = await webhookRoute.POST(
      new Request('https://shop.example/api/payments/paystack/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-paystack-signature': paystackSignature(raw, SECRET),
        },
        body: raw,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'paid', delivered: 'sent' });

    const mail = calls.find((call) => call.url === APPS_URL);
    const payload = JSON.parse(String(mail?.init?.body)) as { text: string };
    const key = payload.text.match(/ANQ1\.\S+/)?.[0] ?? '';
    expect(verifyLicenseKey(key, publicKeyPem).valid).toBe(true);
  });

  it('rejects an unsigned webhook before doing any work', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    const calls = stubPaystack(transaction());

    const response = await webhookRoute.POST(
      new Request('https://shop.example/api/payments/paystack/webhook', {
        method: 'POST',
        body: JSON.stringify({ event: 'charge.success', data: { reference: REF } }),
      })
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('exposes the health check used by uptime monitors', async () => {
    const response = getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('single-use licence activation', () => {
  const INSTALL_A = 'a'.repeat(32);
  const INSTALL_B = 'b'.repeat(32);

  function licenceKey(options: { device?: string | null; days?: number; now?: Date } = {}): string {
    return issueLicense({
      business: 'Ada Stores',
      plan: 'standard',
      days: options.days ?? 365,
      device: options.device ?? null,
      now: options.now ?? new Date('2026-11-18T12:00:00.000Z'),
      id: 'lic_test_1',
      privateKeyPem,
    }).key;
  }

  function registryEnv(): void {
    vi.stubEnv('LICENSE_PUBLIC_KEY', publicKeyPem);
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'shared-secret');
  }

  function stubRegistry(
    state: 'bound' | 'taken' | 'released' | 'unbound',
    calls: Call[] = []
  ): Call[] {
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return Response.json({
        ok: true,
        state,
        boundAt: state === 'taken' ? '2026-11-20T09:00:00.000Z' : '2026-11-21T10:00:00.000Z',
      });
    }) as typeof fetch);
    return calls;
  }

  function activationRequest(key: string, installId: string): Request {
    return jsonRequest('https://shop.example/api/licence/activate', { key, installId });
  }

  it('binds a new key to the first computer through the registry', async () => {
    registryEnv();
    const calls = stubRegistry('bound');

    const response = await activateRoute.POST(activationRequest(licenceKey(), INSTALL_A));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      state: 'active',
      licenceId: 'lic_test_1',
    });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent).toMatchObject({
      secret: 'shared-secret',
      action: 'activate',
      licenceId: 'lic_test_1',
      installId: INSTALL_A,
      business: 'Ada Stores',
      plan: 'standard',
    });
  });

  it('refuses the same key on a second computer', async () => {
    registryEnv();
    stubRegistry('taken');

    const response = await activateRoute.POST(activationRequest(licenceKey(), INSTALL_B));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'LICENSE_IN_USE' });
  });

  it('fails closed when the activation registry is not configured', async () => {
    vi.stubEnv('LICENSE_PUBLIC_KEY', publicKeyPem);
    vi.stubEnv('APPS_SCRIPT_URL', '');
    vi.stubEnv('APPS_SCRIPT_SECRET', '');
    const calls = stubRegistry('bound');

    const response = await activateRoute.POST(activationRequest(licenceKey(), INSTALL_A));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'ACTIVATION_UNAVAILABLE' });
    expect(calls).toHaveLength(0);
  });

  it('checks device-bound keys offline without touching the registry', async () => {
    vi.stubEnv('LICENSE_PUBLIC_KEY', publicKeyPem);
    const calls = stubRegistry('bound');

    const accepted = await activateRoute.POST(
      activationRequest(licenceKey({ device: INSTALL_A }), INSTALL_A)
    );
    expect(accepted.status).toBe(200);

    const rejected = await activateRoute.POST(
      activationRequest(licenceKey({ device: INSTALL_A }), INSTALL_B)
    );
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({ code: 'LICENSE_DEVICE_MISMATCH' });
    expect(calls).toHaveLength(0);
  });

  it('rejects an expired key', async () => {
    registryEnv();
    stubRegistry('bound');
    const expired = licenceKey({ days: 1, now: new Date('2026-11-01T12:00:00.000Z') });

    const response = await activateRoute.POST(activationRequest(expired, INSTALL_A));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'LICENSE_EXPIRED' });
  });

  it('releases the binding from the same computer', async () => {
    registryEnv();
    const calls = stubRegistry('released');

    const response = await deactivateRoute.POST(activationRequest(licenceKey(), INSTALL_A));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, state: 'released' });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      action: 'deactivate',
      licenceId: 'lic_test_1',
      installId: INSTALL_A,
    });
  });

  it('will not release a binding held by another computer', async () => {
    registryEnv();
    stubRegistry('taken');

    const response = await deactivateRoute.POST(activationRequest(licenceKey(), INSTALL_B));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'LICENSE_DEVICE_MISMATCH' });
  });
  function codedTransaction(overrides: Partial<PaystackTransaction> = {}): PaystackTransaction {
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
        licenceDays: 365,
      },
      ...overrides,
    });
  }

  it('charges the discounted amount and records the code in Paystack metadata', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('WEBSITE_URL', 'https://shop.example');
    const calls = stubPaystack(codedTransaction());

    const response = await checkoutRoute.POST(
      jsonRequest('https://shop.example/api/checkout', {
        plan: 'standard',
        business: 'Ada Stores',
        name: 'Ada Obi',
        email: 'ada@example.com',
        discountCode: 'save20000',
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      order: {
        originalAmountKobo: number;
        discountKobo: number;
        discountCode: string;
        amountKobo: number;
      };
    };
    expect(body.order).toMatchObject({
      originalAmountKobo: 8_000_000,
      discountKobo: 2_000_000,
      discountCode: 'SAVE20000',
      amountKobo: 6_000_000,
    });
    const init = calls.find((call) => call.url.endsWith('/transaction/initialize'));
    expect(JSON.parse(String(init?.init?.body))).toMatchObject({
      amount: 6_000_000,
      metadata: {
        originalAmountKobo: 8_000_000,
        discountKobo: 2_000_000,
        discountCode: 'SAVE20000',
        amountKobo: 6_000_000,
      },
    });
  });

  it('refuses an invalid discount code before calling Paystack', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    const calls = stubPaystack(transaction());

    const response = await checkoutRoute.POST(
      jsonRequest('https://shop.example/api/checkout', {
        plan: 'standard',
        business: 'Ada Stores',
        email: 'ada@example.com',
        discountCode: 'NOPE',
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_DISCOUNT_CODE' });
    expect(calls).toHaveLength(0);
  });

  it('issues a key only when the coded amount is exactly the discounted price', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('LICENSE_PRIVATE_KEY', privateKeyPem);
    stubPaystack(codedTransaction());

    const response = await statusRoute.GET(
      new Request(`https://shop.example/api/checkout/${REF}`),
      {
        params: { reference: REF },
      }
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { order: { amountKobo: number; discountCode: string } };
    expect(body.order).toMatchObject({ amountKobo: 6_000_000, discountCode: 'SAVE20000' });

    vi.stubGlobal('fetch', (async (input: RequestInfo | URL) => {
      if (String(input).includes('/transaction/verify/')) {
        return Response.json({ status: true, data: codedTransaction({ amount: 5_999_999 }) });
      }
      return new Response('', { status: 302 });
    }) as typeof fetch);
    const underpaid = await statusRoute.GET(
      new Request(`https://shop.example/api/checkout/${REF}`),
      {
        params: { reference: REF },
      }
    );
    expect(underpaid.status).toBe(400);
  });
});
