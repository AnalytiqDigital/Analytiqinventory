import { describe, expect, it } from 'vitest';
import type { CloudConfig } from '../config';
import type { Order } from '../orders/order.store';
import { LicenseDelivery, whatsappRecipient } from './licence-delivery';

function config(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    paystackSecretKey: '',
    orderStorePath: 'unused.json',
    leadStorePath: 'unused-leads.json',
    licensePrivateKeyPem: '',
    licenseDays: 365,
    websiteUrl: 'https://shop.example',
    allowedOrigin: 'https://shop.example',
    resendApiKey: 're_test',
    emailFrom: 'keys@shop.example',
    whatsappToken: 'wa_test',
    whatsappPhoneNumberId: '123456',
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    reference: 'ord_abc123',
    planId: 'standard',
    business: 'Ada Stores',
    name: 'Ada Obi',
    email: 'ada@example.com',
    phone: '0813 971 1767',
    amountKobo: 8_000_000,
    status: 'paid',
    licenseKey: 'ANQ1.payload.signature',
    createdAt: '2026-11-18T12:00:00.000Z',
    paidAt: '2026-11-18T12:00:00.000Z',
    ...overrides,
  };
}

interface Sent {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function fakeFetch(status = 200): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response('{}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: impl, sent };
}

describe('whatsappRecipient', () => {
  it('turns a local Nigerian number into the wa.me form', () => {
    expect(whatsappRecipient('0813 971 1767')).toBe('2348139711767');
    expect(whatsappRecipient('+234 813 971 1767')).toBe('2348139711767');
  });

  it('refuses numbers too short to dial', () => {
    expect(whatsappRecipient('')).toBeNull();
    expect(whatsappRecipient('12345')).toBeNull();
  });
});

describe('LicenseDelivery', () => {
  it('sends the key by email and WhatsApp when both are configured', async () => {
    const { fetch, sent } = fakeFetch();
    const delivery = new LicenseDelivery(
      config(),
      fetch,
      () => new Date('2026-11-18T12:01:00.000Z')
    );

    const record = await delivery.deliver(order());

    expect(record).toEqual({
      email: { state: 'sent', at: '2026-11-18T12:01:00.000Z' },
      whatsapp: { state: 'sent', at: '2026-11-18T12:01:00.000Z' },
    });
    expect(sent).toHaveLength(2);

    const email = sent.find((call) => call.url === 'https://api.resend.com/emails');
    expect(email?.headers.authorization).toBe('Bearer re_test');
    expect(email?.body).toMatchObject({
      from: 'keys@shop.example',
      to: ['ada@example.com'],
      subject: 'Your AnalytIQ licence key',
    });
    expect(String(email?.body.text)).toContain('ANQ1.payload.signature');
    expect(String(email?.body.text)).toContain('https://shop.example/retrieve-key');

    const whatsapp = sent.find((call) => call.url.includes('graph.facebook.com'));
    expect(whatsapp?.url).toBe('https://graph.facebook.com/v21.0/123456/messages');
    expect(whatsapp?.body).toMatchObject({
      to: '2348139711767',
      type: 'text',
      text: { body: expect.stringContaining('ANQ1.payload.signature') },
    });
  });

  it('records skipped channels instead of failing when delivery is not configured', async () => {
    const { fetch, sent } = fakeFetch();
    const delivery = new LicenseDelivery(
      config({ resendApiKey: '', whatsappToken: '' }),
      fetch
    );

    const record = await delivery.deliver(order());
    expect(record.email?.state).toBe('skipped');
    expect(record.whatsapp?.state).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('marks a rejected provider as failed and keeps going', async () => {
    const { fetch } = fakeFetch(500);
    const delivery = new LicenseDelivery(config(), fetch);

    const record = await delivery.deliver(order());
    expect(record.email?.state).toBe('failed');
    expect(record.whatsapp?.state).toBe('failed');
  });

  it('does not resend a channel that already succeeded', async () => {
    const { fetch, sent } = fakeFetch();
    const delivery = new LicenseDelivery(config(), fetch);

    const record = await delivery.deliver(
      order({
        delivery: {
          email: { state: 'sent', at: '2026-11-18T12:00:00.000Z' },
          whatsapp: { state: 'failed', at: '2026-11-18T12:00:00.000Z' },
        },
      })
    );

    expect(record.email?.state).toBe('sent');
    expect(record.whatsapp?.state).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('graph.facebook.com');
  });
});
