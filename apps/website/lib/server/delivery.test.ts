import { describe, expect, it } from 'vitest';
import type { WebConfig } from './config';
import {
  deliverEmail,
  deliverLead,
  licenceEmail,
  type MailMessage,
} from './delivery';
import type { OrderView } from '../types';

const APPS_URL = 'https://script.google.com/macros/s/abc/exec';

function config(overrides: Partial<WebConfig> = {}): WebConfig {
  return {
    paystackSecretKey: '',
    licensePrivateKeyPem: '',
    licenseDays: 365,
    websiteUrl: 'https://shop.example',
    appsScriptUrl: APPS_URL,
    appsScriptSecret: 'shared-secret',
    resendApiKey: '',
    emailFrom: '',
    ...overrides,
  };
}

function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    reference: 'ord_abc123',
    planId: 'standard',
    planName: 'AnalytIQ Inventory & POS',
    business: 'Ada Stores',
    name: 'Ada Obi',
    email: 'ada@example.com',
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
  method: string | undefined;
  redirect: RequestRedirect | undefined;
  contentType: string;
  body: Record<string, unknown>;
}

function fakeFetch(status = 302): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    sent.push({
      url: String(input),
      method: init?.method,
      redirect: init?.redirect,
      contentType: headers['content-type'] ?? '',
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response('', { status });
  }) as typeof fetch;
  return { fetch: impl, sent };
}

const MESSAGE: MailMessage = {
  to: 'ada@example.com',
  subject: 'Your AnalytIQ licence key',
  text: 'Key: ANQ1.payload.signature',
};

describe('licenceEmail', () => {
  it('includes the key, order reference and recovery link', () => {
    const mail = licenceEmail(order(), 'https://shop.example');
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toBe('Your AnalytIQ licence key');
    expect(mail.text).toContain('ANQ1.payload.signature');
    expect(mail.text).toContain('ord_abc123');
    expect(mail.text).toContain('https://shop.example/retrieve-key');
    expect(mail.text).toContain('Settings → Licence');
  });
});

describe('Apps Script delivery', () => {
  it('posts the message with the shared secret and accepts the redirect', async () => {
    const { fetch, sent } = fakeFetch(302);
    const state = await deliverEmail(MESSAGE, config(), fetch);

    expect(state).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      url: APPS_URL,
      method: 'POST',
      redirect: 'manual',
      contentType: 'text/plain;charset=utf-8',
      body: {
        secret: 'shared-secret',
        action: 'email',
        to: 'ada@example.com',
        subject: 'Your AnalytIQ licence key',
        text: 'Key: ANQ1.payload.signature',
      },
    });
  });

  it('records a script rejection as failed without throwing', async () => {
    const { fetch } = fakeFetch(500);
    expect(await deliverEmail(MESSAGE, config(), fetch)).toBe('failed');
  });

  it('posts demo and quote leads for the sheet', async () => {
    const { fetch, sent } = fakeFetch(200);
    const stored = await deliverLead({ kind: 'demo', name: 'Ada' }, config(), fetch);

    expect(stored).toBe(true);
    expect(sent[0]?.body).toEqual({
      secret: 'shared-secret',
      action: 'lead',
      lead: { kind: 'demo', name: 'Ada' },
    });
    expect(await deliverLead({ kind: 'demo' }, config({ appsScriptUrl: '' }), fetch)).toBe(
      false
    );
  });
});

describe('email fallbacks', () => {
  it('uses Resend when Apps Script is not configured', async () => {
    const { fetch, sent } = fakeFetch(200);
    const state = await deliverEmail(
      MESSAGE,
      config({ appsScriptUrl: '', appsScriptSecret: '', resendApiKey: 're_test', emailFrom: 'keys@shop.example' }),
      fetch
    );

    expect(state).toBe('sent');
    expect(sent[0]?.url).toBe('https://api.resend.com/emails');
    expect(sent[0]?.body).toMatchObject({
      from: 'keys@shop.example',
      to: ['ada@example.com'],
      subject: 'Your AnalytIQ licence key',
      text: 'Key: ANQ1.payload.signature',
    });
  });

  it('skips email when no transport is configured', async () => {
    const { fetch, sent } = fakeFetch();
    const state = await deliverEmail(
      MESSAGE,
      config({ appsScriptUrl: '', appsScriptSecret: '', resendApiKey: '', emailFrom: '' }),
      fetch
    );
    expect(state).toBe('skipped');
    expect(sent).toHaveLength(0);
  });

  it('skips orders without an email address', async () => {
    const { fetch, sent } = fakeFetch();
    expect(await deliverEmail({ ...MESSAGE, to: '' }, config(), fetch)).toBe('skipped');
    expect(sent).toHaveLength(0);
  });
});
