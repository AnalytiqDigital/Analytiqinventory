import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { verifyLicenseKey } from '@analytiq/licensing/dist/key';
import type { CloudConfig } from './config';
import { LicenseIssuer } from './licensing/license-issuer';
import { MemoryOrderStore } from './orders/order.store';
import { OrdersService } from './orders/orders.service';
import { PaystackClient, paystackSignature } from './payments/paystack';
import { PaystackWebhookController } from './paystack-webhook.controller';

const SECRET = 'sk_test_webhook';
const INPUT = {
  plan: 'pro' as const,
  business: 'Ada Stores',
  name: 'Ada Obi',
  email: 'ada@example.com',
  phone: '',
};

function config(privateKey = ''): CloudConfig {
  return {
    paystackSecretKey: SECRET,
    orderStorePath: 'unused.json',
    licensePrivateKeyPem: privateKey,
    licenseDays: 365,
    websiteUrl: 'https://shop.example',
    allowedOrigin: 'https://shop.example',
  };
}

function eventBody(reference: string, amount: number, event = 'charge.success'): Buffer {
  return Buffer.from(
    JSON.stringify({
      event,
      data: { reference, amount, currency: 'NGN', status: 'success' },
    })
  );
}

describe('paystack webhook', () => {
  let orders: OrdersService;
  let publicKeyPem: string;
  let issuer: LicenseIssuer;

  beforeEach(() => {
    const pair = generateKeyPairSync('ed25519');
    publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    orders = new OrdersService(new MemoryOrderStore(), () => new Date('2026-11-18T12:00:00Z'));
    issuer = new LicenseIssuer(privateKeyPem, 365, () => new Date('2026-11-18T12:00:00Z'));
  });

  function controller(cfg = config()): PaystackWebhookController {
    return new PaystackWebhookController(orders, issuer, new PaystackClient(cfg.paystackSecretKey));
  }

  function signed(raw: Buffer): { request: { rawBody: Buffer }; signature: string } {
    return { request: { rawBody: raw }, signature: paystackSignature(raw, SECRET) };
  }

  it('rejects unsigned and tampered deliveries', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo);
    const hook = controller();

    await expect(hook.handle({ rawBody: raw }, undefined)).rejects.toThrowError(/signature/);
    await expect(hook.handle({ rawBody: raw }, 'deadbeef')).rejects.toThrowError(/signature/);
    expect((await orders.get(order.reference))?.status).toBe('pending');
  });

  it('marks the order paid and issues a verifiable key', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo);
    const { request, signature } = signed(raw);

    const result = await controller().handle(request, signature);
    expect(result).toEqual({ ok: true, status: 'paid', alreadyPaid: false });

    const paid = await orders.get(order.reference);
    expect(paid).toMatchObject({ status: 'paid', paidAt: '2026-11-18T12:00:00.000Z' });
    const check = verifyLicenseKey(paid?.licenseKey ?? '', publicKeyPem);
    expect(check.valid).toBe(true);
    expect(check.payload).toMatchObject({ business: 'Ada Stores', plan: 'pro' });
    const expiry = check.payload?.expires ? Date.parse(check.payload.expires) : 0;
    expect(expiry).toBe(Date.parse('2027-11-18T12:00:00.000Z'));
  });

  it('is idempotent when Paystack redelivers the same charge', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo);
    const { request, signature } = signed(raw);
    const hook = controller();

    await hook.handle(request, signature);
    const key = (await orders.get(order.reference))?.licenseKey;
    const again = await hook.handle(request, signature);
    expect(again).toEqual({ ok: true, status: 'paid', alreadyPaid: true });
    expect((await orders.get(order.reference))?.licenseKey).toBe(key);
  });

  it('refuses an underpayment and leaves the order pending', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo - 1);
    const { request, signature } = signed(raw);

    await expect(controller().handle(request, signature)).rejects.toThrowError(/does not match/);
    expect((await orders.get(order.reference))?.status).toBe('pending');
  });

  it('acknowledges unknown references and unrelated events', async () => {
    const hook = controller();
    const unknown = eventBody('ord_unknown', 1_000);
    const { request, signature } = signed(unknown);
    expect(await hook.handle(request, signature)).toEqual({ ok: true, ignored: true });

    const order = await orders.create(INPUT);
    const other = eventBody(order.reference, order.amountKobo, 'transfer.success');
    const signedOther = signed(other);
    expect(await hook.handle(signedOther.request, signedOther.signature)).toEqual({
      ok: true,
      ignored: true,
    });
    expect((await orders.get(order.reference))?.status).toBe('pending');
  });

  it('refuses every webhook while payments are unconfigured', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo);
    const hook = new PaystackWebhookController(orders, issuer, new PaystackClient(''));
    await expect(hook.handle({ rawBody: raw }, 'anything')).rejects.toThrowError(/not configured/);
  });

  it('fails the delivery when the issuer has no key, so Paystack retries', async () => {
    const order = await orders.create(INPUT);
    const raw = eventBody(order.reference, order.amountKobo);
    const { request, signature } = signed(raw);
    const hook = new PaystackWebhookController(
      orders,
      new LicenseIssuer('', 365),
      new PaystackClient(SECRET)
    );

    await expect(hook.handle(request, signature)).rejects.toThrowError(/private key/);
    expect((await orders.get(order.reference))?.status).toBe('pending');
  });
});
