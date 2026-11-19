import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutSchema, findLicensePlan } from '@analytiq/validation';
import { ApiError, parseInput } from '../common/api-error';
import { FileOrderStore, MemoryOrderStore } from './order.store';
import { OrdersService } from './orders.service';

const INPUT = {
  plan: 'standard' as const,
  business: 'Ada Stores',
  name: 'Ada Obi',
  email: 'ada@example.com',
  phone: '',
};

function service(now = new Date('2026-11-18T10:00:00.000Z')) {
  return new OrdersService(new MemoryOrderStore(), () => now);
}

describe('cloud orders', () => {
  it('creates a pending order at the catalogue price', async () => {
    const orders = service();
    const order = await orders.create(INPUT);
    expect(order.reference).toMatch(/^ord_[0-9a-f]{24}$/);
    expect(order.status).toBe('pending');
    expect(order.licenseKey).toBeNull();
    expect(order.amountKobo).toBe(findLicensePlan('standard')?.priceKobo);
    expect(order.createdAt).toBe('2026-11-18T10:00:00.000Z');
    expect(await orders.get(order.reference)).toMatchObject({ business: 'Ada Stores' });
  });

  it('normalises and validates checkout input', () => {
    const parsed = parseInput(checkoutSchema, {
      ...INPUT,
      email: '  Ada@Example.COM ',
    });
    expect(parsed.email).toBe('ada@example.com');

    expect(() => parseInput(checkoutSchema, { ...INPUT, plan: 'free' })).toThrowError(ApiError);
    expect(() => parseInput(checkoutSchema, { ...INPUT, email: 'nope' })).toThrowError(
      /valid email/
    );
    expect(() => parseInput(checkoutSchema, { ...INPUT, business: 'A' })).toThrowError(
      /business name/
    );
  });

  it('issues exactly once, even for duplicate or concurrent settlements', async () => {
    const orders = service();
    const order = await orders.create(INPUT);
    let issued = 0;
    const issue = () => {
      issued += 1;
      return `ANQ1.key.${issued}`;
    };

    const results = await Promise.all([
      orders.settle(order.reference, issue),
      orders.settle(order.reference, issue),
    ]);
    expect(issued).toBe(1);
    expect(results.map((r) => r.alreadyPaid).sort()).toEqual([false, true]);
    expect(new Set(results.map((r) => r.order?.licenseKey))).toEqual(new Set(['ANQ1.key.1']));

    const later = await orders.settle(order.reference, issue);
    expect(later.alreadyPaid).toBe(true);
    expect(issued).toBe(1);
    expect((await orders.get(order.reference))?.status).toBe('paid');
  });

  it('leaves the order pending when the amount check fails', async () => {
    const orders = service();
    const order = await orders.create(INPUT);
    let issued = false;

    await expect(
      orders.settle(
        order.reference,
        () => {
          issued = true;
          return 'ANQ1.key';
        },
        () => {
          throw new ApiError(400, 'The paid amount does not match the order', 'AMOUNT_MISMATCH');
        }
      )
    ).rejects.toThrowError(/does not match/);

    expect(issued).toBe(false);
    expect((await orders.get(order.reference))?.status).toBe('pending');
  });

  it('ignores references the API never issued', async () => {
    const orders = service();
    let issued = false;
    const result = await orders.settle('ord_unknown', () => {
      issued = true;
      return 'ANQ1.key';
    });
    expect(result).toEqual({ order: null, alreadyPaid: false });
    expect(issued).toBe(false);
  });

  it('survives a restart with the file store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'analytiq-orders-'));
    const file = join(dir, 'orders.json');
    const first = new OrdersService(
      new FileOrderStore(file),
      () => new Date('2026-11-18T10:00:00Z')
    );
    const order = await first.create(INPUT);
    await first.settle(order.reference, () => 'ANQ1.persisted.sig');

    const reopened = new OrdersService(new FileOrderStore(file));
    expect(await reopened.get(order.reference)).toMatchObject({
      status: 'paid',
      licenseKey: 'ANQ1.persisted.sig',
    });
    const snapshot = JSON.parse(readFileSync(file, 'utf8')) as { version: number };
    expect(snapshot.version).toBe(1);
  });
});
