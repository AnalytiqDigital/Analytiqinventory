import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, newId } from '@analytiq/database';
import { issueLicense } from '@analytiq/licensing';
import { buildServer } from './server';

const ADMIN = { email: 'ada@testmart.ng', password: 'Admin1234' };

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
    admin: { name: 'Ada Admin', ...ADMIN },
  };
}

/** 45000 + 7.5% VAT = 48375. */
const SALE_TOTAL = 48375;

describe('LAN server API', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-lan-'));
    app = buildServer({ dbPath: join(dir, 'local.db'), logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  async function call(method: string, url: string, payload?: unknown, token?: string) {
    return app.inject({
      method: method as 'GET',
      url,
      payload: payload as Record<string, unknown> | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  async function signIn(): Promise<{ token: string; businessId: string }> {
    const setup = await call('POST', '/api/setup', setupInput());
    expect(setup.statusCode).toBe(200);
    const login = await call('POST', '/api/auth/login', ADMIN);
    expect(login.statusCode).toBe(200);
    const body = login.json() as { token: string; user: { businessId: string } };
    return { token: body.token, businessId: body.user.businessId };
  }

  async function newProduct(token: string): Promise<string> {
    const res = await call(
      'POST',
      '/api/products',
      {
        name: 'Indomie 70g',
        sku: 'IND-70',
        sellingPriceKobo: 45000,
        costPriceKobo: 32000,
        openingStock: 20,
      },
      token
    );
    expect(res.statusCode).toBe(200);
    return (res.json() as { id: string }).id;
  }

  it('reports setup status and seeds the business once', async () => {
    const before = await call('GET', '/api/status');
    expect(before.json()).toEqual({ setupComplete: false });

    const setup = await call('POST', '/api/setup', setupInput());
    expect(setup.statusCode).toBe(200);
    expect((setup.json() as { ok: boolean }).ok).toBe(true);

    const after = await call('GET', '/api/status');
    expect(after.json()).toEqual({ setupComplete: true });

    const again = await call('POST', '/api/setup', setupInput());
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ ok: false, code: 'ALREADY_SETUP' });
  });

  it('logs in, reads the session and logs out', async () => {
    await signIn();
    const login = await call('POST', '/api/auth/login', ADMIN);
    const body = login.json() as { token: string; user: { email: string }; expiresAt: string };
    expect(typeof body.token).toBe('string');
    expect(body.user.email).toBe(ADMIN.email);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());

    const me = await call('GET', '/api/auth/me', undefined, body.token);
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe(ADMIN.email);

    const out = await call('POST', '/api/auth/logout', undefined, body.token);
    expect(out.statusCode).toBe(200);

    const stale = await call('GET', '/api/auth/me', undefined, body.token);
    expect(stale.statusCode).toBe(401);
    expect(stale.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects bad credentials and unauthenticated reads', async () => {
    await signIn();

    const bad = await call('POST', '/api/auth/login', {
      email: ADMIN.email,
      password: 'WrongPass1',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });

    const anonymous = await call('GET', '/api/products');
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('throttles repeated sign-in attempts from one address', async () => {
    await signIn();

    for (let attempt = 0; attempt < 9; attempt += 1) {
      const res = await call('POST', '/api/auth/login', {
        email: 'nobody@testmart.ng',
        password: 'WrongPass1',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    const limited = await call('POST', '/api/auth/login', ADMIN);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('creates a product, adjusts stock and records a sale', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const adjust = await call(
      'POST',
      '/api/stock/adjust',
      { productId, quantityDelta: 5, reason: 'Delivery check' },
      token
    );
    expect(adjust.statusCode).toBe(200);
    expect((adjust.json() as { qtyAfter: number }).qtyAfter).toBe(25);

    const levels = await call('GET', '/api/stock/levels?search=Indomie', undefined, token);
    expect(levels.statusCode).toBe(200);
    const levelItems = (levels.json() as { items: Array<{ productId: string; onHand: number }> })
      .items;
    expect(levelItems[0]).toMatchObject({ productId, onHand: 25 });

    const sale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'cash', amountKobo: 50000 }],
      },
      token
    );
    expect(sale.statusCode).toBe(200);
    const saleBody = sale.json() as { id: string; totalKobo: number; changeKobo: number };
    expect(saleBody.totalKobo).toBe(SALE_TOTAL);
    expect(saleBody.changeKobo).toBe(50000 - SALE_TOTAL);

    const list = await call('GET', '/api/sales', undefined, token);
    expect(list.statusCode).toBe(200);
    expect((list.json() as { total: number }).total).toBe(1);

    const detail = await call('GET', `/api/sales/${saleBody.id}`, undefined, token);
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { sale: { totalKobo: number } }).sale.totalKobo).toBe(SALE_TOTAL);
  });

  it('counts only credit tenders against a customer account', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const created = await call(
      'POST',
      '/api/customers',
      { name: 'Ada Obi', phone: '08030000000', creditLimitKobo: 500000 },
      token
    );
    expect(created.statusCode).toBe(200);
    const customerId = (created.json() as { id: string }).id;

    const cashSale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'cash', amountKobo: SALE_TOTAL }],
      },
      token
    );
    expect(cashSale.statusCode).toBe(200);

    const afterCash = await call('GET', `/api/customers/${customerId}`, undefined, token);
    expect((afterCash.json() as { customer: { balanceKobo: number } }).customer.balanceKobo).toBe(
      0
    );

    const creditSale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
      },
      token
    );
    expect(creditSale.statusCode).toBe(200);

    const afterCredit = await call('GET', `/api/customers/${customerId}`, undefined, token);
    expect((afterCredit.json() as { customer: { balanceKobo: number } }).customer.balanceKobo).toBe(
      SALE_TOTAL
    );

    const listed = await call('GET', '/api/customers', undefined, token);
    expect((listed.json() as { outstandingKobo: number }).outstandingKobo).toBe(SALE_TOTAL);
  });

  it('serves a live report summary and validates the range', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const sale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        payments: [{ method: 'cash', amountKobo: SALE_TOTAL }],
      },
      token
    );
    expect(sale.statusCode).toBe(200);

    const res = await call('GET', '/api/reports/summary', undefined, token);
    expect(res.statusCode).toBe(200);
    const { summary } = res.json() as {
      summary: {
        sales: { transactions: number; grossKobo: number; taxKobo: number; netKobo: number };
        payments: Array<{ method: string; amountKobo: number }>;
        topProducts: Array<{ productId: string; qty: number }>;
        inventory: { productCount: number; costValueKobo: number };
      };
    };
    expect(summary.sales.transactions).toBe(1);
    expect(summary.sales.grossKobo).toBe(SALE_TOTAL);
    expect(summary.sales.taxKobo).toBe(3375);
    expect(summary.sales.netKobo).toBe(45000);
    expect(summary.payments).toEqual([{ method: 'cash', count: 1, amountKobo: SALE_TOTAL }]);
    expect(summary.topProducts).toEqual([
      { productId, name: 'Indomie 70g', qty: 1, revenueKobo: 45000, profitKobo: 13000 },
    ]);
    // Opening stock 20, one sold at cost 32000.
    expect(summary.inventory.productCount).toBe(1);
    expect(summary.inventory.costValueKobo).toBe(19 * 32000);

    const empty = await call(
      'GET',
      '/api/reports/summary?from=2000-01-01T00:00:00.000Z&to=2000-01-02T00:00:00.000Z',
      undefined,
      token
    );
    expect(
      (empty.json() as { summary: { sales: { transactions: number } } }).summary.sales.transactions
    ).toBe(0);

    const inverted = await call(
      'GET',
      '/api/reports/summary?from=2026-12-31&to=2026-01-01',
      undefined,
      token
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ ok: false, code: 'INVALID_RANGE' });

    const anonymous = await call('GET', '/api/reports/summary');
    expect(anonymous.statusCode).toBe(401);
  });

  it('creates, lists, restores and deletes backups', async () => {
    const { token } = await signIn();
    await newProduct(token);

    const created = await call('POST', '/api/backups', undefined, token);
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { backup: { name: string; sizeBytes: number } };
    expect(createdBody.backup.name).toMatch(/^analytiq-backup-\d{8}-\d{9}\.db$/);
    expect(createdBody.backup.sizeBytes).toBeGreaterThan(0);

    const listed = await call('GET', '/api/backups', undefined, token);
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json() as { dir: string; items: Array<{ name: string }> };
    expect(listedBody.dir).toContain('backups');
    expect(listedBody.items.map((item) => item.name)).toContain(createdBody.backup.name);

    await call(
      'POST',
      '/api/products',
      { name: 'Peak Milk', sku: 'PEAK-1', sellingPriceKobo: 30000, openingStock: 4 },
      token
    );
    expect((await call('GET', '/api/products', undefined, token)).json()).toMatchObject({
      total: 2,
    });

    const restored = await call(
      'POST',
      '/api/backups/restore',
      { name: createdBody.backup.name },
      token
    );
    expect(restored.statusCode).toBe(200);
    expect((restored.json() as { safetyBackup: { name: string } }).safetyBackup.name).toMatch(
      /^pre-restore-/
    );
    expect((await call('GET', '/api/products', undefined, token)).json()).toMatchObject({
      total: 1,
    });

    const removed = await call(
      'DELETE',
      `/api/backups/${createdBody.backup.name}`,
      undefined,
      token
    );
    expect(removed.statusCode).toBe(200);

    const bad = await call('POST', '/api/backups/restore', { name: '../local.db' }, token);
    expect(bad.statusCode).toBe(400);
  });

  it('enforces permissions for writes', async () => {
    const { token, businessId } = await signIn();
    await newProduct(token);

    const now = Math.floor(Date.now() / 1000);
    const role = app.db.raw
      .prepare("SELECT id FROM roles WHERE name = 'Cashier' LIMIT 1")
      .get() as { id: string };
    app.db.raw
      .prepare(
        `INSERT INTO users
           (id, business_id, name, email, password_hash, is_active, failed_attempts,
            locked_until, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, NULL, 1, ?, ?)`
      )
      .run(
        newId('usr'),
        businessId,
        'Cashier One',
        'cashier@testmart.ng',
        await hashPassword('Cashier123'),
        now,
        now
      );
    const cashier = app.db.raw
      .prepare('SELECT id FROM users WHERE email = ?')
      .get('cashier@testmart.ng') as { id: string };
    app.db.raw
      .prepare('INSERT INTO user_roles (user_id, role_id, business_id) VALUES (?, ?, ?)')
      .run(cashier.id, role.id, businessId);

    const login = await call('POST', '/api/auth/login', {
      email: 'cashier@testmart.ng',
      password: 'Cashier123',
    });
    expect(login.statusCode).toBe(200);
    const cashierToken = (login.json() as { token: string }).token;

    const denied = await call(
      'POST',
      '/api/products',
      { name: 'Blocked Product', sellingPriceKobo: 1000 },
      cashierToken
    );
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const allowed = await call('GET', '/api/products', undefined, cashierToken);
    expect(allowed.statusCode).toBe(200);

    const importDenied = await call(
      'POST',
      '/api/import/products',
      { rows: [{ name: 'Blocked import' }] },
      cashierToken
    );
    expect(importDenied.statusCode).toBe(403);
    expect(importDenied.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const reportDenied = await call('GET', '/api/reports/summary', undefined, cashierToken);
    expect(reportDenied.statusCode).toBe(403);
    expect(reportDenied.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const backupDenied = await call('GET', '/api/backups', undefined, cashierToken);
    expect(backupDenied.statusCode).toBe(403);
  });

  it('stores automation settings without echoing secrets and previews alerts', async () => {
    const { token } = await signIn();
    await call(
      'POST',
      '/api/products',
      {
        name: 'Peak Milk',
        sellingPriceKobo: 120000,
        costPriceKobo: 90000,
        openingStock: 2,
        reorderLevel: 10,
      },
      token
    );

    const defaults = await call('GET', '/api/automation/settings', undefined, token);
    expect(defaults.statusCode).toBe(200);
    const defaultsBody = defaults.json() as { settings: Record<string, unknown> };
    expect(defaultsBody.settings).toMatchObject({
      whatsappEnabled: false,
      whatsappTokenSet: false,
      aiApiKeySet: false,
      lowStockEnabled: false,
    });
    expect(defaultsBody.settings).not.toHaveProperty('whatsappToken');
    expect(defaultsBody.settings).not.toHaveProperty('aiApiKey');

    const flags = {
      aiEnabled: false,
      lowStockEnabled: false,
      dailySummaryEnabled: false,
      dailySummaryHour: 20,
    };
    const invalid = await call(
      'POST',
      '/api/automation/settings',
      { ...flags, whatsappEnabled: true },
      token
    );
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ ok: false, code: 'AUTOMATION_INVALID' });

    const saved = await call(
      'POST',
      '/api/automation/settings',
      { ...flags, whatsappEnabled: false, lowStockEnabled: true },
      token
    );
    expect(saved.statusCode).toBe(200);
    expect(
      (saved.json() as { settings: { lowStockEnabled: boolean } }).settings.lowStockEnabled
    ).toBe(true);

    const test = await call('POST', '/api/automation/test', { body: 'Hello from the LAN' }, token);
    expect(test.statusCode).toBe(200);
    expect((test.json() as { message: { status: string } }).message.status).toBe('dry_run');

    const run = await call('POST', '/api/automation/run', {}, token);
    expect(run.statusCode).toBe(200);
    expect((run.json() as { result: { queued: number; dryRun: number } }).result).toMatchObject({
      queued: 1,
      dryRun: 1,
    });

    const enabled = await call(
      'POST',
      '/api/automation/settings',
      {
        ...flags,
        whatsappEnabled: true,
        whatsappPhoneId: '1234567890',
        whatsappToken: 'EAAG-secret',
        whatsappTo: '2348012345678',
        aiEnabled: true,
        aiBaseUrl: 'https://api.example.com/v1',
        aiApiKey: 'sk-secret',
        lowStockEnabled: true,
      },
      token
    );
    expect(enabled.statusCode).toBe(200);
    expect(enabled.body).not.toContain('EAAG-secret');
    expect(enabled.body).not.toContain('sk-secret');
    expect((enabled.json() as { settings: Record<string, unknown> }).settings).toMatchObject({
      whatsappEnabled: true,
      whatsappTokenSet: true,
      aiApiKeySet: true,
      aiModel: 'gpt-4o-mini',
    });

    const messages = await call('GET', '/api/automation/messages?limit=5', undefined, token);
    const items = (messages.json() as { messages: Array<{ kind: string }> }).messages;
    expect(items.map((m) => m.kind)).toEqual(['low_stock', 'test']);
  });

  it('serves module installs, batch stock and price lists over REST', async () => {
    const { token } = await signIn();

    const modules = await call('GET', '/api/modules', undefined, token);
    expect(modules.statusCode).toBe(200);
    const preset = modules.json() as { businessType: string; modules: string[] };
    expect(preset.businessType).toBe('retail');
    expect(preset.modules).toContain('returns');
    expect(preset.modules).not.toContain('priceTiers');

    const switched = await call('POST', '/api/modules', { overrides: { priceTiers: true } }, token);
    expect(switched.statusCode).toBe(200);
    expect((switched.json() as { modules: string[] }).modules).toContain('priceTiers');

    const product = await call(
      'POST',
      '/api/products',
      {
        name: 'Panadol Extra',
        sku: 'PAN-1',
        sellingPriceKobo: 20000,
        costPriceKobo: 12000,
        openingStock: 0,
        trackBatches: true,
      },
      token
    );
    expect(product.statusCode).toBe(200);
    const productId = (product.json() as { id: string }).id;

    const intake = await call(
      'POST',
      '/api/batches',
      {
        productId,
        batchNo: 'B-9',
        expiryDate: new Date(Date.now() + 15 * 86_400_000).toISOString(),
        qty: 10,
      },
      token
    );
    expect(intake.statusCode).toBe(200);
    expect(typeof (intake.json() as { batchId: string }).batchId).toBe('string');

    const batches = await call('GET', '/api/batches?search=Panadol', undefined, token);
    expect(batches.statusCode).toBe(200);
    const batchItems = (batches.json() as { items: Array<{ batchNo: string; remaining: number }> })
      .items;
    expect(batchItems).toHaveLength(1);
    expect(batchItems[0]).toMatchObject({ batchNo: 'B-9', remaining: 10 });

    const alerts = await call('GET', '/api/batches/expiry-alerts?days=60', undefined, token);
    expect(alerts.statusCode).toBe(200);
    const alertNos = (alerts.json() as { items: Array<{ batchNo: string }> }).items.map(
      (b) => b.batchNo
    );
    expect(alertNos).toContain('B-9');

    const tier = await call('POST', '/api/price-tiers', { name: 'Wholesale' }, token);
    expect(tier.statusCode).toBe(200);
    const tierId = (tier.json() as { id: string }).id;
    const priced = await call(
      'PUT',
      `/api/price-tiers/${tierId}/prices`,
      { prices: [{ productId, priceKobo: 15000 }] },
      token
    );
    expect(priced.statusCode).toBe(200);
    expect((priced.json() as { saved: number }).saved).toBe(1);

    const prices = await call('GET', `/api/price-tiers/${tierId}/prices`, undefined, token);
    const priceItems = (prices.json() as { items: Array<{ tierPriceKobo: number }> }).items;
    expect(priceItems[0]?.tierPriceKobo).toBe(15000);
  });

  it('looks up a receipt and records a counter return over REST', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const sale = await call(
      'POST',
      '/api/sales',
      { items: [{ productId, qty: 2 }], payments: [{ method: 'cash', amountKobo: 100000 }] },
      token
    );
    expect(sale.statusCode).toBe(200);
    const sold = sale.json() as { id: string; receiptNo: string; totalKobo: number };
    expect(sold.totalKobo).toBe(SALE_TOTAL * 2);

    const lookup = await call(
      'GET',
      `/api/returns/lookup?receipt=${encodeURIComponent(sold.receiptNo)}`,
      undefined,
      token
    );
    expect(lookup.statusCode).toBe(200);
    const lines = (lookup.json() as { sale: { items: Array<{ id: string; qty: number }> } }).sale
      .items;
    expect(lines).toHaveLength(1);
    const [line] = lines;
    if (!line) throw new Error('Expected the receipt to have one line');

    const refund = await call(
      'POST',
      '/api/returns',
      {
        saleId: sold.id,
        items: [{ saleItemId: line.id, qty: 1 }],
        reason: 'Customer returned one pack',
        refundMethod: 'cash',
        kind: 'refund',
      },
      token
    );
    expect(refund.statusCode).toBe(200);
    expect((refund.json() as { refundKobo: number }).refundKobo).toBe(SALE_TOTAL);

    const product = await call('GET', `/api/products/${productId}`, undefined, token);
    expect((product.json() as { product: { onHand: number } }).product.onHand).toBe(19);

    const history = await call('GET', '/api/returns', undefined, token);
    const historyItems = (history.json() as { items: Array<{ kind: string }> }).items;
    expect(historyItems[0]?.kind).toBe('refund');
  });

  it('lists debtors and previews WhatsApp reminders over REST', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const customer = await call(
      'POST',
      '/api/customers',
      { name: 'Owing Obi', phone: '08031234567', creditLimitKobo: 200000 },
      token
    );
    expect(customer.statusCode).toBe(200);
    const customerId = (customer.json() as { id: string }).id;

    const sale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        customerId,
        payments: [{ method: 'credit', amountKobo: SALE_TOTAL }],
      },
      token
    );
    expect(sale.statusCode).toBe(200);

    const debtors = await call('GET', '/api/debtors', undefined, token);
    expect(debtors.statusCode).toBe(200);
    const debtorBody = debtors.json() as {
      items: Array<{ name: string; balanceKobo: number }>;
      totalKobo: number;
    };
    expect(debtorBody.items).toHaveLength(1);
    expect(debtorBody.items[0]?.name).toBe('Owing Obi');
    expect(debtorBody.totalKobo).toBe(SALE_TOTAL);

    const remind = await call('POST', '/api/debtors/remind', { dryRun: true }, token);
    expect(remind.statusCode).toBe(200);
    expect(
      (remind.json() as { result: { attempted: number; dryRun: number } }).result
    ).toMatchObject({ attempted: 1, dryRun: 1 });
  });

  it('returns a coded 404 for missing records', async () => {
    const { token } = await signIn();
    const res = await call('GET', '/api/products/prod_missing', undefined, token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
  });

  it('starts a trial, then blocks business routes once it ends', async () => {
    const { token } = await signIn();

    const status = await call('GET', '/api/license/status', undefined, token);
    expect(status.statusCode).toBe(200);
    const statusBody = status.json() as {
      status: { state: string; usable: boolean; installId: string };
    };
    expect(statusBody.status).toMatchObject({ state: 'trial', usable: true });
    expect(statusBody.status.installId).toMatch(/^[0-9a-f]{32}$/);

    // Backdate the trial so the next request sees an expired copy.
    app.db.raw
      .prepare("UPDATE schema_meta SET value = ? WHERE key = 'license.trial_started'")
      .run(new Date(Date.now() - 30 * 86_400_000).toISOString());

    const blocked = await call('GET', '/api/products', undefined, token);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ ok: false, code: 'LICENSE_REQUIRED' });

    // Licensing and session endpoints stay open so the copy can be activated.
    const stillStatus = await call('GET', '/api/license/status', undefined, token);
    expect(stillStatus.statusCode).toBe(200);
    expect((stillStatus.json() as { status: { usable: boolean } }).status.usable).toBe(false);
    const me = await call('GET', '/api/auth/me', undefined, token);
    expect(me.statusCode).toBe(200);
  });

  it('activates a signed key and restores access', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const licensedDir = mkdtempSync(join(tmpdir(), 'analytiq-license-'));
    const licensed = buildServer({
      dbPath: join(licensedDir, 'local.db'),
      logger: false,
      licensePublicKey: publicPem,
    });

    try {
      const post = async (url: string, payload?: unknown, token?: string) =>
        licensed.inject({
          method: 'POST',
          url,
          payload: payload as Record<string, unknown> | undefined,
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
      const get = async (url: string, token: string) =>
        licensed.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

      await post('/api/setup', setupInput());
      const login = await post('/api/auth/login', ADMIN);
      const token = (login.json() as { token: string }).token;

      // Trial starts on first status read, then is backdated to expire.
      await get('/api/license/status', token);
      licensed.db.raw
        .prepare("UPDATE schema_meta SET value = ? WHERE key = 'license.trial_started'")
        .run(new Date(Date.now() - 30 * 86_400_000).toISOString());

      const blocked = await get('/api/products', token);
      expect(blocked.statusCode).toBe(403);

      const issued = issueLicense({
        business: 'Test Mart',
        plan: 'pro',
        privateKeyPem: privatePem,
      });
      // First activation checks the licence registry; keep the test offline.
      vi.stubGlobal('fetch', (async () => Response.json({ ok: true, state: 'active' })) as typeof fetch);
      const activated = await post('/api/license/activate', { key: issued.key }, token);
      expect(activated.statusCode).toBe(200);
      expect(
        (activated.json() as { status: { state: string; usable: boolean; plan: string } }).status
      ).toMatchObject({ state: 'active', usable: true, plan: 'pro' });

      const allowed = await get('/api/products', token);
      expect(allowed.statusCode).toBe(200);

      const audit = licensed.db.raw
        .prepare("SELECT entity_id FROM audit_logs WHERE action = 'license.activated'")
        .all() as Array<{ entity_id: string }>;
      expect(audit).toHaveLength(1);
      expect(audit[0]?.entity_id).toBe(issued.payload.id);

      const tampered = await post('/api/license/activate', { key: `${issued.key}x` }, token);
      expect(tampered.statusCode).toBe(400);
      expect(tampered.json()).toMatchObject({ ok: false, code: 'LICENSE_INVALID' });

      const released = await post('/api/license/deactivate', undefined, token);
      expect(released.statusCode).toBe(200);
      expect((released.json() as { status: { usable: boolean } }).status.usable).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      await licensed.close();
    }
  });

  it('creates and promotes branch locations', async () => {
    const { token } = await signIn();

    const initial = await call('GET', '/api/locations', undefined, token);
    expect(initial.statusCode).toBe(200);
    const initialItems = (initial.json() as { items: Array<{ name: string; isDefault: boolean }> })
      .items;
    expect(initialItems).toHaveLength(1);
    expect(initialItems[0]).toMatchObject({ name: 'Main Store', isDefault: true });

    const created = await call(
      'POST',
      '/api/locations',
      { name: 'Lekki Branch', address: 'Admiralty Way' },
      token
    );
    expect(created.statusCode).toBe(200);
    const branch = (created.json() as { location: { id: string; isDefault: boolean } }).location;
    expect(branch.isDefault).toBe(false);

    const duplicate = await call('POST', '/api/locations', { name: 'Lekki Branch' }, token);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: 'LOCATION_EXISTS' });

    const promoted = await call('PATCH', `/api/locations/${branch.id}`, { isDefault: true }, token);
    expect(promoted.statusCode).toBe(200);
    expect((promoted.json() as { location: { isDefault: boolean } }).location.isDefault).toBe(true);

    const listed = await call('GET', '/api/locations', undefined, token);
    const items = (listed.json() as { items: Array<{ name: string; isDefault: boolean }> }).items;
    expect(items[0]).toMatchObject({ name: 'Lekki Branch', isDefault: true });
    expect(items.filter((item) => item.isDefault)).toHaveLength(1);
  });

  it('refuses sync traffic when no key is configured', async () => {
    await signIn();
    const res = await call('GET', '/sync/pull?entity=products&since=0');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'SYNC_NOT_CONFIGURED' });
  });

  it('relays pushes and pulls with the shared sync key', async () => {
    const relayDir = mkdtempSync(join(tmpdir(), 'analytiq-relay-'));
    const relay = buildServer({
      dbPath: join(relayDir, 'local.db'),
      logger: false,
      syncKey: 'branch-key',
    });

    try {
      const inject = async (
        method: string,
        url: string,
        options: { payload?: unknown; token?: string; key?: string } = {}
      ) =>
        relay.inject({
          method: method as 'GET',
          url,
          payload: options.payload as Record<string, unknown> | undefined,
          headers: {
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
            ...(options.key ? { 'x-sync-key': options.key } : {}),
          },
        });

      await inject('POST', '/api/setup', { payload: setupInput() });

      const anonymous = await inject('GET', '/sync/pull?entity=products&since=0');
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toMatchObject({ code: 'SYNC_UNAUTHORIZED' });

      const wrongKey = await inject('GET', '/sync/pull?entity=products&since=0', { key: 'nope' });
      expect(wrongKey.statusCode).toBe(401);

      const now = Math.floor(Date.now() / 1000);
      const pushed = await inject('POST', '/sync/push', {
        key: 'branch-key',
        payload: {
          records: [
            {
              entity: 'products',
              id: 'prd_relay_1',
              version: 1,
              updatedAt: now,
              data: {
                name: 'Relay Milo',
                selling_price_kobo: 50000,
                version: 1,
                created_at: now,
                updated_at: now,
              },
            },
            {
              entity: 'customers',
              id: 'cus_relay_1',
              version: 1,
              updatedAt: now,
              data: {
                name: 'Relay Customer',
                phone: '',
                email: '',
                address: '',
                note: '',
                credit_limit_kobo: 0,
                is_active: 1,
                version: 1,
                created_at: now,
                updated_at: now,
              },
            },
          ],
        },
      });
      expect(pushed.statusCode).toBe(200);
      expect(pushed.json()).toMatchObject({ ok: true, applied: 2, skipped: 0 });

      const products = await inject('GET', '/sync/pull?entity=products&since=0', {
        key: 'branch-key',
      });
      expect(products.statusCode).toBe(200);
      const productsBody = products.json() as {
        records: Array<{ id: string }>;
        cursor: number;
        hasMore: boolean;
      };
      expect(productsBody.records.map((record) => record.id)).toContain('prd_relay_1');
      expect(productsBody.cursor).toBeGreaterThan(0);

      const unknownEntity = await inject('GET', '/sync/pull?entity=nope&since=0', {
        key: 'branch-key',
      });
      expect(unknownEntity.statusCode).toBe(400);
      expect(unknownEntity.json()).toMatchObject({ code: 'SYNC_INVALID' });

      const customers = await inject('GET', '/sync/pull?entity=customers&since=0', {
        key: 'branch-key',
      });
      expect(
        (customers.json() as { records: Array<{ id: string }> }).records.map((r) => r.id)
      ).toContain('cus_relay_1');

      const stored = relay.db.raw
        .prepare('SELECT name FROM products WHERE id = ?')
        .get('prd_relay_1') as { name: string } | undefined;
      expect(stored?.name).toBe('Relay Milo');
    } finally {
      await relay.close();
    }
  });

  it('serves the business header and exact barcode lookups', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const bySku = await call('GET', '/api/products/by-barcode?code=IND-70', undefined, token);
    expect(bySku.statusCode).toBe(200);
    const found = bySku.json() as { product: { id: string; onHand: number } | null };
    expect(found.product?.id).toBe(productId);
    expect(found.product?.onHand).toBe(20);

    const missing = await call('GET', '/api/products/by-barcode?code=SKU-NOPE', undefined, token);
    expect((missing.json() as { product: unknown }).product).toBeNull();

    const empty = await call('GET', '/api/products/by-barcode?code=', undefined, token);
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ code: 'INVALID_SCAN' });

    const business = await call('GET', '/api/business', undefined, token);
    expect(business.statusCode).toBe(200);
    expect(business.json()).toMatchObject({
      ok: true,
      business: { name: 'Test Mart', state: 'Lagos', taxLabel: 'VAT', taxRateBps: 750 },
    });
  });

  it('imports products, received purchases and historical sales', async () => {
    const { token } = await signIn();

    const products = await call(
      'POST',
      '/api/import/products',
      {
        rows: [
          {
            name: 'Milo 400g',
            sku: 'MIL-400',
            barcode: '6151100099999',
            category: 'Beverages',
            sellingPriceKobo: 350000,
            costPriceKobo: 280000,
            openingStock: 5,
          },
          { name: 'Peak Milk', sku: 'PEAK-1', sellingPriceKobo: 120000, openingStock: 3 },
        ],
      },
      token
    );
    expect(products.statusCode).toBe(200);
    expect(products.json()).toMatchObject({ ok: true, created: 2, failed: 0 });

    const purchases = await call(
      'POST',
      '/api/import/purchases',
      {
        rows: [
          {
            reference: 'PO-1',
            supplier: 'Peak Foods',
            sku: 'MIL-400',
            qty: 10,
            unitCostKobo: 280000,
            received: true,
          },
        ],
      },
      token
    );
    expect(purchases.statusCode).toBe(200);
    expect(purchases.json()).toMatchObject({ ok: true, created: 1, failed: 0 });

    const sales = await call(
      'POST',
      '/api/import/sales',
      {
        rows: [
          {
            receipt: 'OLD-1',
            date: '2026-11-02',
            sku: 'MIL-400',
            qty: 2,
            unitPriceKobo: 350000,
            tender: 'cash',
          },
          {
            receipt: 'OLD-1',
            date: '2026-11-02',
            sku: 'PEAK-1',
            qty: 1,
            unitPriceKobo: 120000,
            tender: 'cash',
          },
        ],
      },
      token
    );
    expect(sales.statusCode).toBe(200);
    expect(sales.json()).toMatchObject({ ok: true, created: 1, failed: 0 });

    const barcode = await call(
      'GET',
      '/api/products/by-barcode?code=6151100099999',
      undefined,
      token
    );
    expect((barcode.json() as { product: { onHand: number } }).product.onHand).toBe(13);

    const again = await call(
      'POST',
      '/api/import/sales',
      { rows: [{ receipt: 'OLD-1', sku: 'MIL-400', qty: 1, unitPriceKobo: 350000 }] },
      token
    );
    expect(again.json()).toMatchObject({ ok: true, created: 0, failed: 1 });
    expect((again.json() as { errors: Array<{ code?: string }> }).errors[0]?.code).toBe(
      'SALE_REFERENCE_EXISTS'
    );
  });

  it('serves masters, stock adjustments, returns, contact imports and menu reports', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const brandRes = await call('POST', '/api/masters/brands', { name: 'Dangote' }, token);
    expect(brandRes.statusCode).toBe(200);
    const brandId = (brandRes.json() as { item: { id: string } }).item.id;

    const brandsRes = await call('GET', '/api/masters/brands', undefined, token);
    expect(brandsRes.statusCode).toBe(200);
    expect(
      (brandsRes.json() as { items: Array<{ name: string }> }).items.map((b) => b.name)
    ).toContain('Dangote');

    const renamed = await call(
      'PATCH',
      `/api/masters/brands/${brandId}`,
      { name: 'Dangote Group' },
      token
    );
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { item: { name: string } }).item.name).toBe('Dangote Group');

    for (const [kind, body] of [
      ['units', { name: 'Carton', shortName: 'ctn' }],
      ['warranties', { name: '6 months', durationDays: 180 }],
      ['customer-groups', { name: 'Wholesale', note: 'Bulk buyers' }],
    ] as const) {
      const created = await call('POST', `/api/masters/${kind}`, body, token);
      expect(created.statusCode).toBe(200);
    }

    const unknown = await call('GET', '/api/masters/nope', undefined, token);
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ ok: false });

    const purchaseRes = await call(
      'POST',
      '/api/purchases',
      { items: [{ productId, qty: 5, unitCostKobo: 32000 }] },
      token
    );
    expect(purchaseRes.statusCode).toBe(200);
    const purchaseId = (purchaseRes.json() as { id: string }).id;

    const received = await call('POST', `/api/purchases/${purchaseId}/receive`, {}, token);
    expect(received.statusCode).toBe(200);

    const opening = await call(
      'POST',
      '/api/import/opening-stock',
      { rows: [{ sku: 'IND-70', qty: 20 }] },
      token
    );
    expect(opening.statusCode).toBe(200);
    expect(opening.json()).toMatchObject({ ok: true, created: 1, failed: 0 });

    const again = await call(
      'POST',
      '/api/import/opening-stock',
      { rows: [{ sku: 'IND-70', qty: 20 }] },
      token
    );
    expect(again.json()).toMatchObject({ ok: true, created: 1, failed: 0 });

    const contacts = await call(
      'POST',
      '/api/import/contacts',
      {
        rows: [
          { name: 'Ada Obi', type: 'customer', group: 'Wholesale' },
          { name: 'Peak Foods', type: 'supplier' },
        ],
      },
      token
    );
    expect(contacts.statusCode).toBe(200);
    expect(contacts.json()).toMatchObject({ ok: true, created: 2, failed: 0 });

    const returned = await call(
      'POST',
      '/api/purchase-returns',
      { purchaseId, reason: 'Damaged in transit', items: [{ productId, qty: 1 }] },
      token
    );
    expect(returned.statusCode).toBe(200);
    expect(returned.json()).toMatchObject({ ok: true, totalKobo: 32000 });

    const adjusted = await call(
      'POST',
      '/api/stock-adjustments',
      { reason: 'Damaged', items: [{ productId, qtyDelta: -1 }] },
      token
    );
    expect(adjusted.statusCode).toBe(200);
    expect(adjusted.json()).toMatchObject({ ok: true });

    const overdraw = await call(
      'POST',
      '/api/stock-adjustments',
      { reason: 'Typo', items: [{ productId, qtyDelta: -1000 }] },
      token
    );
    expect(overdraw.statusCode).toBe(400);
    expect(overdraw.json()).toMatchObject({ ok: false, code: 'NEGATIVE_STOCK' });

    const onHand = await call('GET', '/api/products/by-barcode?code=IND-70', undefined, token);
    expect((onHand.json() as { product: { onHand: number } }).product.onHand).toBe(18);

    const adjustments = await call('GET', '/api/stock-adjustments', undefined, token);
    expect(adjustments.statusCode).toBe(200);
    const adjustmentList = (adjustments.json() as { items: Array<{ reference: string }> }).items;
    expect(adjustmentList).toHaveLength(1);

    const returns = await call('GET', '/api/purchase-returns', undefined, token);
    expect(returns.statusCode).toBe(200);
    expect((returns.json() as { items: unknown[] }).items).toHaveLength(1);

    const menu = await call('GET', '/api/reports/menu', undefined, token);
    expect(menu.statusCode).toBe(200);
    const report = (
      menu.json() as {
        report: {
          purchaseSale: { purchaseCount: number; purchaseKobo: number; salesKobo: number };
          stockAdjustments: Array<{ reason: string }>;
          purchasePayments: Array<{ totalKobo: number; returnsKobo: number; balanceKobo: number }>;
          customers: Array<{ name: string; groupName: string }>;
          productPurchases: Array<{ qty: number; costKobo: number }>;
        };
      }
    ).report;
    expect(report.purchaseSale.purchaseCount).toBe(1);
    expect(report.purchaseSale.purchaseKobo).toBe(160000);
    expect(report.purchaseSale.salesKobo).toBe(0);
    expect(report.stockAdjustments[0]?.reason).toBe('Damaged');
    expect(report.purchasePayments[0]).toMatchObject({
      totalKobo: 160000,
      returnsKobo: 32000,
      balanceKobo: 128000,
    });
    expect(report.customers[0]).toMatchObject({ name: 'Ada Obi', groupName: 'Wholesale' });
    expect(report.productPurchases[0]).toMatchObject({ qty: 5, costKobo: 160000 });
  });

  it('manages staff, role permissions and expenses', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const rolesRes = await call('GET', '/api/staff/roles', undefined, token);
    expect(rolesRes.statusCode).toBe(200);
    const roles = (
      rolesRes.json() as {
        items: Array<{ id: string; name: string; permissions: string[] }>;
      }
    ).items;
    const cashierRole = roles.find((r) => r.name === 'Cashier');
    expect(cashierRole?.permissions).toContain('sales.create');

    const created = await call(
      'POST',
      '/api/staff',
      {
        name: 'Chidi Cashier',
        email: 'chidi@testmart.ng',
        password: 'Cashier123',
        roleId: cashierRole?.id,
      },
      token
    );
    expect(created.statusCode).toBe(200);
    const staffList = await call('GET', '/api/staff', undefined, token);
    expect(
      (staffList.json() as { items: Array<{ email: string }> }).items.some(
        (s) => s.email === 'chidi@testmart.ng'
      )
    ).toBe(true);

    const login = await call('POST', '/api/auth/login', {
      email: 'chidi@testmart.ng',
      password: 'Cashier123',
    });
    const cashierToken = (login.json() as { token: string }).token;
    const expenseDenied = await call('GET', '/api/finance/expenses', undefined, cashierToken);
    expect(expenseDenied.statusCode).toBe(403);
    expect(expenseDenied.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const expense = await call(
      'POST',
      '/api/finance/expenses',
      { category: 'Rent', amountKobo: 500_000, note: 'November rent' },
      token
    );
    expect(expense.statusCode).toBe(200);
    const expenseId = (expense.json() as { expense: { id: string } }).expense.id;
    const listed = await call('GET', '/api/finance/expenses', undefined, token);
    expect((listed.json() as { totalKobo: number }).totalKobo).toBe(500_000);

    const patched = await call(
      'PATCH',
      `/api/finance/expenses/${expenseId}`,
      { amountKobo: 450_000, note: 'Rent corrected' },
      token
    );
    expect(patched.statusCode).toBe(200);
    expect(
      (patched.json() as { expense: { amountKobo: number; note: string } }).expense
    ).toMatchObject({ amountKobo: 450_000, note: 'Rent corrected' });
    const relisted = await call('GET', '/api/finance/expenses', undefined, token);
    expect((relisted.json() as { totalKobo: number }).totalKobo).toBe(450_000);

    const strip = await call(
      'PATCH',
      `/api/staff/roles/${cashierRole?.id}`,
      { permissions: ['sales.view'] },
      token
    );
    expect(strip.statusCode).toBe(200);
    const saleDenied = await call(
      'POST',
      '/api/sales',
      { items: [{ productId, qty: 1 }], payments: [{ method: 'cash', amountKobo: 50_000 }] },
      cashierToken
    );
    expect(saleDenied.statusCode).toBe(403);

    const reset = await call(
      'POST',
      `/api/staff/${(created.json() as { staff: { id: string } }).staff.id}/password`,
      { password: 'Freshpass99' },
      token
    );
    expect(reset.statusCode).toBe(200);
    const relogin = await call('POST', '/api/auth/login', {
      email: 'chidi@testmart.ng',
      password: 'Freshpass99',
    });
    expect(relogin.statusCode).toBe(200);
  });

  it('serves cash and bank ledgers and restaurant service settings over REST', async () => {
    const { token } = await signIn();
    const productId = await newProduct(token);

    const created = await call(
      'POST',
      '/api/accounts',
      { name: 'GTBank main', kind: 'bank', openingBalanceKobo: 100_000 },
      token
    );
    expect(created.statusCode).toBe(200);
    const bankId = (created.json() as { account: { id: string } }).account.id;

    const sale = await call(
      'POST',
      '/api/sales',
      {
        items: [{ productId, qty: 1 }],
        orderType: 'dine_in',
        waiterName: 'Ada',
        serviceChargeKobo: 750,
        tipKobo: 500,
        payments: [{ method: 'cash', amountKobo: 60_000 }],
      },
      token
    );
    expect(sale.statusCode).toBe(200);
    const saleBody = sale.json() as { id: string; totalKobo: number };
    expect(saleBody.totalKobo).toBeGreaterThanOrEqual(46_250);
    const saleTotal = saleBody.totalKobo;

    const detail = await call('GET', `/api/sales/${saleBody.id}`, undefined, token);
    expect(detail.statusCode).toBe(200);
    const detailSale = (detail.json() as {
      sale: { orderType: string; waiterName: string; totalKobo: number };
    }).sale;
    expect(detailSale).toMatchObject({ orderType: 'dine_in', waiterName: 'Ada', totalKobo: saleTotal });

    const list = await call('GET', '/api/accounts', undefined, token);
    expect(list.statusCode).toBe(200);
    const listed = list.json() as {
      items: Array<{ id: string; kind: string; name: string; balanceKobo: number }>;
      totalKobo: number;
    };
    const cash = listed.items.find((account) => account.kind === 'cash');
    expect(cash).toBeTruthy();
    expect(cash!.balanceKobo).toBe(saleTotal);

    const adjusted = await call(
      'POST',
      '/api/accounts/adjust',
      { accountId: bankId, amountKobo: 50_000, note: 'Opening float' },
      token
    );
    expect(adjusted.statusCode).toBe(200);
    expect((adjusted.json() as { balanceKobo: number }).balanceKobo).toBe(150_000);

    const transfer = await call(
      'POST',
      '/api/accounts/transfer',
      { fromAccountId: bankId, toAccountId: cash!.id, amountKobo: 25_000, note: 'Drawer float' },
      token
    );
    expect(transfer.statusCode).toBe(200);

    const ledger = await call('GET', '/api/accounts/transactions?limit=100', undefined, token);
    expect(ledger.statusCode).toBe(200);
    const ledgerBody = ledger.json() as {
      items: Array<{ kind: string; amountKobo: number }>;
      moneyInKobo: number;
      moneyOutKobo: number;
    };
    expect(ledgerBody.items.some((tx) => tx.kind === 'sale' && tx.amountKobo === saleTotal)).toBe(true);
    expect(ledgerBody.items.some((tx) => tx.kind === 'transfer_in')).toBe(true);
    expect(ledgerBody.moneyInKobo).toBeGreaterThan(0);

    const mapped = await call('POST', '/api/accounts/payment-map', { cash: bankId }, token);
    expect(mapped.statusCode).toBe(200);
    expect((mapped.json() as { map: { cash?: string } }).map.cash).toBe(bankId);

    const savedSettings = await call(
      'POST',
      '/api/restaurant/settings',
      { serviceChargeBp: 500 },
      token
    );
    expect(savedSettings.statusCode).toBe(200);
    const settings = await call('GET', '/api/restaurant/settings', undefined, token);
    expect(settings.json()).toMatchObject({ ok: true, settings: { serviceChargeBp: 500 } });
  });

  it('keeps the health probe unchanged', async () => {
    const res = await call('GET', '/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', mode: 'lan' });
  });
});
