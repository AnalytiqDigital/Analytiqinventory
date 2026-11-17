import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, newId } from '@analytiq/database';
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
  });

  it('returns a coded 404 for missing records', async () => {
    const { token } = await signIn();
    const res = await call('GET', '/api/products/prod_missing', undefined, token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
  });

  it('keeps the health probe unchanged', async () => {
    const res = await call('GET', '/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', mode: 'lan' });
  });
});
