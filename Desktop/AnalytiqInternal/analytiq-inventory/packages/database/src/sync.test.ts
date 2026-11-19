import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createProduct } from './inventory';
import { createLocation, listLocations, updateLocation } from './locations';
import { runMigrations } from './migrate';
import { runSetup } from './service';
import {
  applyRecords,
  collectChanges,
  getSyncStatus,
  httpTransport,
  ingestRecords,
  listRecordsSince,
  setSyncSettings,
  syncNow,
  type SyncRecord,
  type SyncTransport,
} from './sync';

const GRANTS = ['products.manage', 'inventory.view', 'settings.manage'];
const VIEW_ONLY = ['products.manage', 'inventory.view'];

function setupInput(name = 'Test Mart', email = 'info@testmart.ng') {
  return {
    business: {
      name,
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email,
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: `admin-${email}`, password: 'Admin1234' },
  };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as NodeJS.ErrnoException).code;
  }
  return undefined;
}

async function codeOfAsync(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (err) {
    return (err as NodeJS.ErrnoException).code;
  }
  return undefined;
}

describe('batch 8 locations', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-locations-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
  });

  afterEach(() => closeLocalDb(local));

  it('starts with one default location and lists it first', async () => {
    const items = await listLocations(local, businessId);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Main Store');
    expect(items[0]?.isDefault).toBe(true);
  });

  it('creates a branch, rejects duplicates and audits the change', async () => {
    const branch = await createLocation(local, businessId, userId, GRANTS, {
      name: 'Ikeja Branch',
      address: '12 Allen Avenue',
    });
    expect(branch.isDefault).toBe(false);
    expect(branch.version).toBe(1);

    const duplicate = await codeOfAsync(() =>
      createLocation(local, businessId, userId, GRANTS, { name: 'ikeja branch ' })
    );
    // Names are trimmed but case-sensitive; this one is distinct.
    expect(duplicate).toBeUndefined();
    const exact = await codeOfAsync(() =>
      createLocation(local, businessId, userId, GRANTS, { name: 'Ikeja Branch' })
    );
    expect(exact).toBe('LOCATION_EXISTS');

    const audit = local.raw
      .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'location.create'")
      .get() as { n: number };
    expect(audit.n).toBe(2);
  });

  it('requires settings.manage to change locations', async () => {
    await expect(
      createLocation(local, businessId, userId, VIEW_ONLY, { name: 'Nope' })
    ).rejects.toThrow(/not allowed|permission/i);

    const [main] = await listLocations(local, businessId);
    await expect(
      updateLocation(local, businessId, userId, VIEW_ONLY, main!.id, { name: 'Changed' })
    ).rejects.toThrow(/not allowed|permission/i);
  });

  it('moves the default flag and bumps the version', async () => {
    const branch = await createLocation(local, businessId, userId, GRANTS, { name: 'Lekki' });
    const updated = await updateLocation(local, businessId, userId, GRANTS, branch.id, {
      name: 'Lekki Phase 2',
      address: 'Admiralty Way',
      isDefault: true,
    });
    expect(updated.name).toBe('Lekki Phase 2');
    expect(updated.isDefault).toBe(true);
    expect(updated.version).toBe(2);

    const items = await listLocations(local, businessId);
    expect(items[0]?.name).toBe('Lekki Phase 2');
    expect(items.filter((item) => item.isDefault)).toHaveLength(1);

    const missing = await codeOfAsync(() =>
      updateLocation(local, businessId, userId, GRANTS, 'loc_missing', { name: 'Ghost' })
    );
    expect(missing).toBe('LOCATION_NOT_FOUND');
  });
});

describe('batch 8 sync engine', () => {
  let dir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-sync-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    ({ businessId, userId } = await runSetup(local, setupInput()));
  });

  afterEach(() => closeLocalDb(local));

  it('collects changed rows once and then advances past them', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Peak Milk',
      sellingPriceKobo: 120000,
      openingStock: 5,
    });

    const first = collectChanges(local, businessId, {}, 100);
    const product = first.records.find((record) => record.entity === 'products');
    expect(product?.id).toBe(id);
    expect(first.records.some((record) => record.entity === 'locations')).toBe(true);
    expect(first.hasMore).toBe(false);

    const second = collectChanges(local, businessId, first.cursors, 100);
    expect(second.records).toHaveLength(0);
  });

  it('merges by version and keeps append-only movements immutable', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Milo Tin',
      sellingPriceKobo: 900000,
      openingStock: 3,
    });
    const [row] = local.raw.prepare('SELECT * FROM products WHERE id = ?').all(id) as Array<
      Record<string, unknown>
    >;
    const now = Math.floor(Date.now() / 1000);

    const newer: SyncRecord = {
      entity: 'products',
      id,
      version: 2,
      updatedAt: now + 5,
      data: { ...row, name: 'Milo Refill', version: 2, updated_at: now + 5 },
    };
    expect(applyRecords(local, businessId, [newer])).toEqual({ applied: 1, skipped: 0 });
    const renamed = local.raw.prepare('SELECT name FROM products WHERE id = ?').get(id) as {
      name: string;
    };
    expect(renamed.name).toBe('Milo Refill');

    const stale: SyncRecord = {
      entity: 'products',
      id,
      version: 1,
      updatedAt: now,
      data: { ...row, name: 'Milo Old' },
    };
    applyRecords(local, businessId, [stale]);
    const unchanged = local.raw.prepare('SELECT name FROM products WHERE id = ?').get(id) as {
      name: string;
    };
    expect(unchanged.name).toBe('Milo Refill');

    const movement = local.raw.prepare('SELECT * FROM stock_movements LIMIT 1').get() as Record<
      string,
      unknown
    >;
    const before = (
      local.raw.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number }
    ).n;
    const record: SyncRecord = {
      entity: 'stock_movements',
      id: String(movement.id),
      version: 1,
      updatedAt: Number(movement.created_at),
      data: { ...movement, qty_delta: -999 },
    };
    const result = applyRecords(local, businessId, [record]);
    expect(result.skipped).toBe(0);
    const after = (
      local.raw.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number }
    ).n;
    expect(after).toBe(before);
    const stored = local.raw
      .prepare('SELECT qty_delta FROM stock_movements WHERE id = ?')
      .get(String(movement.id)) as { qty_delta: number };
    expect(stored.qty_delta).toBe(Number(movement.qty_delta));
  });

  it('relays a push into the snapshot log and serves it per entity', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Cowbell Sachet',
      sellingPriceKobo: 25000,
      openingStock: 40,
    });
    const batch = collectChanges(local, businessId, {}, 100);

    const hubDir = mkdtempSync(join(tmpdir(), 'analytiq-hub-'));
    runMigrations(join(hubDir, 'local.db'));
    const hub = openLocalDb(join(hubDir, 'local.db'));
    try {
      const { businessId: hubBusinessId } = await runSetup(
        hub,
        setupInput('Hub Ltd', 'hub@test.ng')
      );
      const first = ingestRecords(hub, hubBusinessId, batch.records);
      expect(first.applied).toBeGreaterThan(0);
      expect(first.skipped).toBe(0);
      // Replaying the same snapshot is a no-op, not a duplicate.
      const replay = ingestRecords(hub, hubBusinessId, batch.records);
      expect(replay.applied).toBe(batch.records.length);

      const page = listRecordsSince(hub, hubBusinessId, 'products', 0, 100);
      expect(page.records.map((record) => record.id)).toContain(id);
      expect(page.cursor).toBeGreaterThan(0);
      expect(page.hasMore).toBe(false);

      const next = listRecordsSince(hub, hubBusinessId, 'products', page.cursor, 100);
      expect(next.records).toHaveLength(0);
    } finally {
      closeLocalDb(hub);
    }
  });

  it('stores sync settings behind settings.manage and validates the shape', async () => {
    expect(
      codeOf(() =>
        setSyncSettings(local, businessId, userId, VIEW_ONLY, { url: '', key: '', enabled: false })
      )
    ).toBe('FORBIDDEN');

    expect(
      codeOf(() =>
        setSyncSettings(local, businessId, userId, GRANTS, { url: '', key: '', enabled: true })
      )
    ).toBe('SYNC_INVALID');

    const saved = setSyncSettings(local, businessId, userId, GRANTS, {
      url: 'https://sync.example.com/',
      key: 'shared-secret',
      enabled: true,
    });
    expect(saved.url).toBe('https://sync.example.com');
    expect(saved.enabled).toBe(true);
    expect(getSyncStatus(local, businessId).settings.key).toBe('shared-secret');

    // Changing the relay drops the cursors so the next run repulls from zero.
    local.raw
      .prepare(
        "INSERT INTO sync_state (business_id, key, value, updated_at) VALUES (?, 'sync.pull.seq', '{\"products\":42}', 1)"
      )
      .run(businessId);
    setSyncSettings(local, businessId, userId, GRANTS, {
      url: 'https://other.example.com',
      key: 'shared-secret',
      enabled: true,
    });
    const cursor = local.raw
      .prepare("SELECT value FROM sync_state WHERE business_id = ? AND key = 'sync.pull.seq'")
      .get(businessId);
    expect(cursor).toBeUndefined();
  });

  it('pushes local rows and applies pulled ones through a transport', async () => {
    const { id } = await createProduct(local, businessId, userId, GRANTS, {
      name: 'Dangote Sugar 500g',
      sellingPriceKobo: 95000,
      openingStock: 12,
    });
    setSyncSettings(local, businessId, userId, GRANTS, {
      url: 'https://sync.example.com',
      key: 'k',
      enabled: true,
    });

    const pushed: SyncRecord[][] = [];
    const remote: SyncRecord = {
      entity: 'customers',
      id: 'cus_remote',
      version: 1,
      updatedAt: Math.floor(Date.now() / 1000),
      data: {
        name: 'Remote Customer',
        phone: '',
        email: '',
        address: '',
        note: '',
        credit_limit_kobo: 0,
        is_active: 1,
        version: 1,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
      },
    };
    let served = false;
    const transport: SyncTransport = {
      async push(records) {
        pushed.push(records);
        return { applied: records.length };
      },
      async pull(entity, since) {
        if (entity === 'customers' && !served && since === 0) {
          served = true;
          return { records: [remote], cursor: 9, hasMore: false };
        }
        return { records: [], cursor: since, hasMore: false };
      },
    };

    const result = await syncNow(local, businessId, transport);
    expect(result.ok).toBe(true);
    expect(result.pushed).toBeGreaterThan(0);
    expect(result.pulled).toBe(1);
    expect(pushed.flat().some((record) => record.id === id)).toBe(true);
    const customer = local.raw
      .prepare('SELECT name FROM customers WHERE id = ?')
      .get('cus_remote') as { name: string } | undefined;
    expect(customer?.name).toBe('Remote Customer');

    const status = getSyncStatus(local, businessId);
    expect(status.lastError).toBeNull();
    expect(status.lastPullAt).not.toBeNull();

    // The pull cursor is per entity and persists.
    const stored = local.raw
      .prepare("SELECT value FROM sync_state WHERE business_id = ? AND key = 'sync.pull.seq'")
      .get(businessId) as { value: string };
    expect(JSON.parse(stored.value)).toMatchObject({ customers: 9 });
  });

  it('refuses to run while disabled and records transport failures', async () => {
    await expect(
      syncNow(local, businessId, {
        push: async () => ({ applied: 0 }),
        pull: async (_entity, since) => ({ records: [], cursor: since, hasMore: false }),
      })
    ).rejects.toThrow(/turned off/i);

    setSyncSettings(local, businessId, userId, GRANTS, {
      url: 'https://sync.example.com',
      key: 'k',
      enabled: true,
    });
    await expect(
      syncNow(local, businessId, {
        push: async () => {
          throw new Error('relay unreachable');
        },
        pull: async (_entity, since) => ({ records: [], cursor: since, hasMore: false }),
      })
    ).rejects.toThrow('relay unreachable');
    expect(getSyncStatus(local, businessId).lastError).toBe('relay unreachable');
  });

  it('sends the shared key and surfaces relay errors over HTTP', async () => {
    const calls: Array<{ url: string; key: string | undefined }> = [];
    const okFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        key: (init?.headers as Record<string, string> | undefined)?.['x-sync-key'],
      });
      return new Response(JSON.stringify({ ok: true, records: [], cursor: 3, hasMore: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const transport = httpTransport('https://relay.example.com/', 'relay-key', okFetch);
    const page = await transport.pull('products', 0, 100);
    expect(page.cursor).toBe(3);
    expect(calls[0]?.url).toBe(
      'https://relay.example.com/sync/pull?entity=products&since=0&limit=100'
    );
    expect(calls[0]?.key).toBe('relay-key');

    const failing = (async () =>
      new Response(
        JSON.stringify({ ok: false, error: 'Invalid sync key', code: 'SYNC_UNAUTHORIZED' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )) as unknown as typeof fetch;
    await expect(
      httpTransport('https://relay.example.com', 'bad', failing).pull('products', 0, 10)
    ).rejects.toMatchObject({ code: 'SYNC_UNAUTHORIZED', message: 'Invalid sync key' });
  });
});
