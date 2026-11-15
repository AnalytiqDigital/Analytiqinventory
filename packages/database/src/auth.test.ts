import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';
import { isFirstRun, login, logout, authenticate, runSetup } from './service';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';

function setupInput(password = 'Admin1234') {
  return {
    business: {
      name: 'Test Mart',
      type: 'retail',
      address: '1 Market Rd',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@testmart.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada Admin', email: 'Ada@TestMart.ng', password },
  };
}

describe('batch 3 auth + setup', () => {
  let dir: string;
  let local: LocalDb;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-test-'));
    runMigrations(join(dir, 'local.db'));
    local = openLocalDb(join(dir, 'local.db'));
    process.env.ANALYTIQ_DB_PATH = join(dir, 'local.db');
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  it('first run is empty, setup creates business + admin', async () => {
    expect(await isFirstRun(local)).toBe(true);
    const { businessId, userId } = await runSetup(local, setupInput());
    expect(businessId).toMatch(/^biz_/);
    expect(userId).toMatch(/^usr_/);
    expect(await isFirstRun(local)).toBe(false);
  });

  it('setup rejects weak passwords and second runs', async () => {
    await expect(runSetup(local, setupInput('short'))).rejects.toThrow();
    await runSetup(local, setupInput());
    await expect(runSetup(local, setupInput())).rejects.toThrow(/already been completed/i);
  });

  it('login succeeds, session authenticates, logout revokes', async () => {
    await runSetup(local, setupInput());
    const result = await login(local, { email: 'ada@testmart.ng', password: 'Admin1234' });
    expect(result.user.permissions).toContain('staff.manage');
    expect(await authenticate(local, result.token)).not.toBeNull();
    await logout(local, result.token);
    expect(await authenticate(local, result.token)).toBeNull();
  });

  it('locks account after 5 failed attempts', async () => {
    await runSetup(local, setupInput());
    for (let i = 0; i < 5; i += 1) {
      await expect(login(local, { email: 'ada@testmart.ng', password: 'Wrong0000' })).rejects.toThrow();
    }
    await expect(login(local, { email: 'ada@testmart.ng', password: 'Admin1234' })).rejects.toThrow(
      /locked/i,
    );
  });
});
