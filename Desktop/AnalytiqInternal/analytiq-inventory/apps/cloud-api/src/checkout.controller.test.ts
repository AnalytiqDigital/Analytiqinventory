import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { licensePlans } from '@analytiq/validation';
import { ApiError } from './common/api-error';
import { CheckoutController } from './checkout.controller';
import type { CloudConfig } from './config';
import { LicenseIssuer } from './licensing/license-issuer';
import { MemoryOrderStore } from './orders/order.store';
import { OrdersService } from './orders/orders.service';
import { PaystackClient } from './payments/paystack';

const CONFIG: CloudConfig = {
  paystackSecretKey: 'sk_test_checkout',
  orderStorePath: 'unused.json',
  licensePrivateKeyPem: '',
  licenseDays: 365,
  websiteUrl: 'https://shop.example',
  allowedOrigin: 'https://shop.example',
};

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    plan: 'starter',
    business: 'Ada Stores',
    name: 'Ada Obi',
    email: 'ada@example.com',
    phone: '',
    ...overrides,
  };
}

interface Sent {
  url: string;
  body: Record<string, unknown>;
}

function fakePaystack(sent: Sent[]): PaystackClient {
  return new PaystackClient(
    'sk_test_checkout',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.test/abc', access_code: 'ac_1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
  );
}

function build(sent: Sent[] = []): CheckoutController {
  const orders = new OrdersService(new MemoryOrderStore());
  return new CheckoutController(orders, fakePaystack(sent), CONFIG);
}

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  const error = await promise.catch((reason: unknown) => reason);
  return error instanceof ApiError ? error.getStatus() : undefined;
}

describe('checkout controller', () => {
  it('serves the shared plan catalogue, price included', () => {
    const body = build().plans();
    expect(body).toEqual({ ok: true, plans: licensePlans });
  });

  it('creates the order, starts Paystack and hides the key until payment', async () => {
    const sent: Sent[] = [];
    const body = (await build(sent).checkout(pendingOrder())) as {
      order: Record<string, unknown>;
      authorizationUrl: string;
    };

    expect(body.authorizationUrl).toBe('https://checkout.paystack.test/abc');
    expect(body.order).toMatchObject({
      status: 'pending',
      planName: 'Starter',
      amountKobo: 2_500_000,
      licenseKey: null,
    });
    expect(body.order.reference).toMatch(/^ord_[0-9a-f]{24}$/);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://api.paystack.co/transaction/initialize');
    expect(sent[0]?.body).toMatchObject({
      email: 'ada@example.com',
      amount: 2_500_000,
      reference: body.order.reference,
      callback_url: 'https://shop.example/checkout/success',
      metadata: { plan: 'starter', business: 'Ada Stores' },
    });
  });

  it('rejects an invalid checkout body with a readable message', async () => {
    const invalid = build().checkout(pendingOrder({ email: 'nope' }));
    await expect(invalid).rejects.toMatchObject({ message: 'Enter a valid email' });
    expect(await statusOf(invalid)).toBe(400);
  });

  it('reports unknown orders and returns the paid order view', async () => {
    const orders = new OrdersService(new MemoryOrderStore());
    const pair = generateKeyPairSync('ed25519');
    const issuer = new LicenseIssuer(
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      365
    );
    const controller = new CheckoutController(orders, fakePaystack([]), CONFIG);

    const missing = controller.status('ord_missing');
    await expect(missing).rejects.toMatchObject({ message: 'That order does not exist' });
    expect(await statusOf(missing)).toBe(404);

    const created = await orders.create({
      plan: 'pro',
      business: 'Ada Stores',
      name: '',
      email: 'ada@example.com',
      phone: '',
    });
    await orders.settle(created.reference, (order) => issuer.issue(order));

    const paid = (await controller.status(created.reference)) as {
      order: Record<string, unknown>;
    };
    expect(paid.order).toMatchObject({ status: 'paid' });
    expect(typeof paid.order.licenseKey).toBe('string');
  });
});
