import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDailySummary,
  buildLowStockDigest,
  countLowStock,
  getAutomationSettings,
  listAutomationMessages,
  runAutomation,
  sendTestMessage,
  setAutomationSettings,
} from './automation';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createProduct } from './inventory';
import { runMigrations } from './migrate';
import { createSale } from './sales';
import { runSetup } from './service';

const GRANTS = [
  'products.manage',
  'inventory.view',
  'sales.create',
  'reports.view',
  'settings.manage',
];
const VIEW_ONLY = ['products.manage', 'inventory.view'];

function setupInput() {
  return {
    business: {
      name: 'Test Mart',
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@testmart.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'ada@testmart.ng', password: 'Admin1234' },
  };
}

function automationInput(overrides: Record<string, unknown> = {}) {
  return {
    whatsappEnabled: false,
    whatsappPhoneId: '',
    whatsappToken: '',
    whatsappTo: '',
    aiEnabled: false,
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    lowStockEnabled: true,
    dailySummaryEnabled: false,
    dailySummaryHour: 20,
    ...overrides,
  };
}

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(handler: (call: Call) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('batch 11 automation', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-automation-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
  });

  afterEach(() => closeLocalDb(local));

  async function lowStockProduct(): Promise<string> {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Peak Milk',
      sellingPriceKobo: 120000,
      costPriceKobo: 100000,
      reorderLevel: 10,
      openingStock: 3,
    });
    return id;
  }

  it('defaults to everything off and gates changes on settings.manage', () => {
    const initial = getAutomationSettings(local, businessId);
    expect(initial).toMatchObject({
      whatsappEnabled: false,
      aiEnabled: false,
      lowStockEnabled: false,
      dailySummaryEnabled: false,
      dailySummaryHour: 20,
    });

    expect(() =>
      setAutomationSettings(local, businessId, userId, VIEW_ONLY, automationInput())
    ).toThrow(/permission/i);

    expect(() =>
      setAutomationSettings(
        local,
        businessId,
        userId,
        GRANTS,
        automationInput({ whatsappEnabled: true, whatsappTo: '+2348012345678' })
      )
    ).toThrow(/phone number id/i);

    const saved = setAutomationSettings(local, businessId, userId, GRANTS, automationInput());
    expect(saved.lowStockEnabled).toBe(true);

    const audit = local.raw
      .prepare(
        "SELECT details FROM audit_logs WHERE action = 'automation.configured' ORDER BY rowid DESC LIMIT 1"
      )
      .get() as { details: string };
    expect(JSON.parse(audit.details)).toMatchObject({ lowStockEnabled: true });
    expect(audit.details).not.toContain('token');
  });

  it('builds a low-stock digest from the ledger', async () => {
    await lowStockProduct();
    expect(countLowStock(local, businessId)).toBe(1);
    const digest = buildLowStockDigest(local, businessId);
    expect(digest).toContain('Low stock alert — 1 item');
    expect(digest).toContain('Peak Milk: 3 pcs left (reorder at 10)');
  });

  it('queues a dry-run alert once per day while WhatsApp is off', async () => {
    await lowStockProduct();
    setAutomationSettings(local, businessId, userId, GRANTS, automationInput());

    const now = new Date(2026, 10, 18, 9, 0, 0);
    const first = await runAutomation(local, businessId, { now });
    expect(first).toMatchObject({ queued: 1, sent: 0, dryRun: 1, failed: 0 });

    const messages = await listAutomationMessages(local, businessId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'low_stock', status: 'dry_run' });
    expect(messages[0]?.body).toContain('Peak Milk');

    const second = await runAutomation(local, businessId, { now });
    expect(second.queued).toBe(0);
    expect(second.skipped).toContain('low_stock');
    expect(await listAutomationMessages(local, businessId)).toHaveLength(1);
  });

  it('summarises the day, including sales and the top seller', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Indomie 70g',
      sellingPriceKobo: 45000,
      costPriceKobo: 32000,
      openingStock: 20,
    });
    await createSale(local, businessId, userId, GRANTS, {
      items: [{ productId: id, qty: 2 }],
      payments: [{ method: 'cash', amountKobo: 200000 }],
    });
    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({ lowStockEnabled: false, dailySummaryEnabled: true, dailySummaryHour: 18 })
    );

    // 45000 kobo × 2 + 7.5% VAT = 96750 kobo (₦967.50).
    const text = buildDailySummary(local, businessId, new Date());
    expect(text).toContain('Daily summary');
    expect(text).toContain('₦967.50');
    expect(text).toContain('Top seller: Indomie 70g ×2');

    const before = await runAutomation(local, businessId, { now: new Date(2026, 10, 18, 8) });
    expect(before.queued).toBe(0);
    expect(before.skipped).toContain('daily_summary');

    const after = await runAutomation(local, businessId, { now: new Date(2026, 10, 18, 19) });
    expect(after.queued).toBe(1);
    expect((await listAutomationMessages(local, businessId))[0]).toMatchObject({
      kind: 'daily_summary',
      status: 'dry_run',
    });
  });

  it('delivers through the WhatsApp Cloud API when enabled', async () => {
    await lowStockProduct();
    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'wa-token',
        whatsappTo: '2348012345678',
      })
    );

    const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ messages: [{ id: 'wamid.1' }] }));
    const result = await runAutomation(local, businessId, {
      now: new Date(2026, 10, 18, 9),
      fetchImpl,
    });
    expect(result).toMatchObject({ queued: 1, sent: 1, failed: 0, dryRun: 0 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://graph.facebook.com/v20.0/1234567890/messages');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer wa-token');
    const payload = JSON.parse(String(calls[0]?.init?.body)) as {
      messaging_product: string;
      to: string;
      text: { body: string };
    };
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348012345678',
    });
    expect(payload.text.body).toContain('Peak Milk');

    const [message] = await listAutomationMessages(local, businessId);
    expect(message).toMatchObject({ status: 'sent', error: '' });
    expect(message?.sentAt).not.toBeNull();
  });

  it('sends a pre-approved template when one is configured', async () => {
    await lowStockProduct();
    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'wa-token',
        whatsappTo: '2348012345678',
        whatsappTemplate: 'shop_alerts',
        whatsappLang: 'en_GB',
      })
    );

    const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ messages: [{ id: 'wamid.2' }] }));
    await runAutomation(local, businessId, { now: new Date(2026, 10, 18, 9), fetchImpl });

    const payload = JSON.parse(String(calls[0]?.init?.body)) as {
      type: string;
      template: {
        name: string;
        language: { code: string };
        components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
      };
    };
    expect(payload.type).toBe('template');
    expect(payload.template.name).toBe('shop_alerts');
    expect(payload.template.language.code).toBe('en_GB');
    expect(payload.template.components[0]?.parameters[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Peak Milk'),
    });
  });

  it('records a failed delivery without throwing', async () => {
    await lowStockProduct();
    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'wa-token',
        whatsappTo: '2348012345678',
      })
    );

    const { fetchImpl } = fakeFetch(() =>
      jsonResponse({ error: { message: 'Recipient phone number not verified' } }, 400)
    );
    const result = await runAutomation(local, businessId, {
      now: new Date(2026, 10, 18, 9),
      fetchImpl,
    });
    expect(result).toMatchObject({ queued: 1, sent: 0, failed: 1 });

    const [message] = await listAutomationMessages(local, businessId);
    expect(message).toMatchObject({ status: 'failed' });
    expect(message?.error).toContain('Recipient phone number not verified');
  });

  it('rewrites the message with the configured AI endpoint, falling back on failure', async () => {
    await lowStockProduct();
    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'wa-token',
        whatsappTo: '2348012345678',
        aiEnabled: true,
        aiBaseUrl: 'https://api.example.com/v1',
        aiApiKey: 'ai-key',
        aiModel: 'gpt-4o-mini',
      })
    );

    const { fetchImpl, calls } = fakeFetch((call) =>
      call.url.endsWith('/chat/completions')
        ? jsonResponse({
            choices: [{ message: { content: 'Milk is running low — restock today.' } }],
          })
        : jsonResponse({ ok: true })
    );
    await runAutomation(local, businessId, { now: new Date(2026, 10, 18, 9), fetchImpl });

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.com/v1/chat/completions',
      'https://graph.facebook.com/v20.0/1234567890/messages',
    ]);
    const aiHeaders = calls[0]?.init?.headers as Record<string, string>;
    expect(aiHeaders.authorization).toBe('Bearer ai-key');
    const [message] = await listAutomationMessages(local, businessId);
    expect(message?.body).toBe('Milk is running low — restock today.');

    // A broken AI endpoint must not stop the alert.
    const broken = fakeFetch((call) =>
      call.url.endsWith('/chat/completions')
        ? jsonResponse({ error: 'down' }, 500)
        : jsonResponse({})
    );
    await runAutomation(local, businessId, {
      now: new Date(2026, 10, 19, 9),
      fetchImpl: broken.fetchImpl,
    });
    const [latest] = await listAutomationMessages(local, businessId);
    expect(latest?.status).toBe('sent');
    expect(latest?.body).toContain('Peak Milk');
  });

  it('sends a test message or previews it without WhatsApp', async () => {
    setAutomationSettings(local, businessId, userId, GRANTS, automationInput());

    const dry = await sendTestMessage(local, businessId, userId, GRANTS, {
      body: 'Hello from AnalytIQ',
    });
    expect(dry).toMatchObject({ kind: 'test', status: 'dry_run', body: 'Hello from AnalytIQ' });

    setAutomationSettings(
      local,
      businessId,
      userId,
      GRANTS,
      automationInput({
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'wa-token',
        whatsappTo: '+2348012345678',
      })
    );
    const { fetchImpl, calls } = fakeFetch(() => jsonResponse({ ok: true }));
    const sent = await sendTestMessage(
      local,
      businessId,
      userId,
      GRANTS,
      { body: 'Ping' },
      {
        fetchImpl,
      }
    );
    expect(sent.status).toBe('sent');
    expect(calls[0]?.url).toContain('/1234567890/messages');

    await expect(
      sendTestMessage(local, businessId, userId, GRANTS, { body: '   ' })
    ).rejects.toThrow(/message/i);
  });

  it('lists the newest messages first', async () => {
    await sendTestMessage(local, businessId, userId, GRANTS, { body: 'first' });
    await sendTestMessage(local, businessId, userId, GRANTS, { body: 'second' });
    const messages = await listAutomationMessages(local, businessId);
    expect(messages.map((message) => message.body)).toEqual(['second', 'first']);
  });
});
