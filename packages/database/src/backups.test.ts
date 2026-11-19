import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDirFor,
  createBackup,
  dailyBackupDue,
  deleteBackup,
  listBackups,
  pruneBackups,
  restoreBackup,
  runDailyBackupIfDue,
  verifyBackup,
} from './backups';
import { closeLocalDb, openLocalDb, type LocalDb } from './connection';
import { createProduct, listProducts } from './inventory';
import { runMigrations } from './migrate';
import { runSetup } from './service';

const GRANTS = ['products.manage', 'inventory.view', 'settings.manage'];

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

function countProducts(file: string): number {
  const db = new Database(file, { readonly: true });
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

describe('batch 12 backups and verified restore', () => {
  let dir: string;
  let dbFile: string;
  let backupsDir: string;
  let local: LocalDb;
  let businessId: string;
  let userId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-backup-'));
    dbFile = join(dir, 'local.db');
    runMigrations(dbFile);
    local = openLocalDb(dbFile);
    backupsDir = backupDirFor(dbFile);
    ({ businessId, userId } = await runSetup(local, setupInput()));
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  async function addProduct(name: string, sku: string): Promise<void> {
    await createProduct(local, businessId, userId, GRANTS, {
      name,
      sku,
      sellingPriceKobo: 45000,
      costPriceKobo: 32000,
      openingStock: 5,
    });
  }

  it('creates a verified snapshot and lists it', () => {
    const { backup } = createBackup(local, backupsDir, GRANTS, userId, businessId);
    expect(backup.name).toMatch(/^analytiq-backup-\d{8}-\d{9}\.db$/);
    expect(backup.sizeBytes).toBeGreaterThan(0);

    const check = verifyBackup(join(backupsDir, backup.name));
    expect(check.ok).toBe(true);
    expect(check.tables).toBeGreaterThan(5);

    const items = listBackups(backupsDir);
    expect(items.map((item) => item.name)).toContain(backup.name);
  });

  it('restores a snapshot and keeps a pre-restore safety copy', async () => {
    await addProduct('Indomie 70g', 'IND-70');
    const { backup } = createBackup(local, backupsDir, GRANTS, userId, businessId);
    await addProduct('Peak Milk', 'PEAK-1');
    expect((await listProducts(local, businessId, {})).total).toBe(2);

    const result = restoreBackup(
      local,
      dbFile,
      backupsDir,
      GRANTS,
      userId,
      businessId,
      backup.name
    );

    expect((await listProducts(local, businessId, {})).total).toBe(1);
    expect(result.safetyBackup.name).toMatch(/^pre-restore-/);
    // The safety copy still holds the data as it was before the restore.
    expect(countProducts(join(backupsDir, result.safetyBackup.name))).toBe(2);
  });

  it('rejects damaged files and unknown names', () => {
    mkdirSync(backupsDir, { recursive: true });
    const fake = 'analytiq-backup-20260101-000000000.db';
    writeFileSync(join(backupsDir, fake), 'this is not a database');

    expect(verifyBackup(join(backupsDir, fake)).ok).toBe(false);
    expect(() =>
      restoreBackup(local, dbFile, backupsDir, GRANTS, userId, businessId, fake)
    ).toThrow(/cannot be restored/i);
    expect(() =>
      restoreBackup(local, dbFile, backupsDir, GRANTS, userId, businessId, '../local.db')
    ).toThrow();
    expect(() =>
      restoreBackup(
        local,
        dbFile,
        backupsDir,
        GRANTS,
        userId,
        businessId,
        'analytiq-backup-20990101-000000000.db'
      )
    ).toThrow(/not found/i);
  });

  it('prunes old backups but keeps safety copies', async () => {
    const names: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      names.push(createBackup(local, backupsDir, GRANTS, userId, businessId).backup.name);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const safety = restoreBackup(
      local,
      dbFile,
      backupsDir,
      GRANTS,
      userId,
      businessId,
      names[names.length - 1]
    ).safetyBackup.name;

    const removed = pruneBackups(backupsDir, 1);
    expect(removed).toBe(2);
    const remaining = listBackups(backupsDir).map((item) => item.name);
    expect(remaining).toContain(names[2]);
    expect(remaining).not.toContain(names[0]);
    expect(remaining).toContain(safety);
  });

  it('takes at most one automatic snapshot per day', () => {
    expect(dailyBackupDue(backupsDir)).toBe(true);
    const first = runDailyBackupIfDue(local, backupsDir);
    expect(first).not.toBeNull();
    expect(dailyBackupDue(backupsDir)).toBe(false);
    expect(runDailyBackupIfDue(local, backupsDir)).toBeNull();
  });

  it('deletes a backup and enforces settings.manage', () => {
    const { backup } = createBackup(local, backupsDir, GRANTS, userId, businessId);
    expect(() => createBackup(local, backupsDir, ['reports.view'], userId, businessId)).toThrow(
      /settings\.manage/
    );
    expect(() =>
      deleteBackup(local, backupsDir, ['reports.view'], userId, businessId, backup.name)
    ).toThrow(/settings\.manage/);

    deleteBackup(local, backupsDir, GRANTS, userId, businessId, backup.name);
    expect(listBackups(backupsDir).map((item) => item.name)).not.toContain(backup.name);
  });
});
