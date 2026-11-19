// Batch 12: local backups and verified restore.
//
// Snapshots use SQLite `VACUUM INTO`, which writes a consistent, compact copy
// of the live database (WAL included) without stopping the app. Every snapshot
// is verified before it is offered or restored. A restore first takes a
// `pre-restore` safety copy of the current database, then swaps the file and
// re-runs migrations so an older backup is brought forward automatically.
//
// Files never leave the machine and are named by the app itself; restore and
// delete accept only that name shape (validated against BACKUP_NAME_PATTERN),
// so no path from a renderer or HTTP client is ever joined blindly.

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { backupNameSchema, BACKUP_NAME_PATTERN } from '@analytiq/validation';
import { closeLocalDb, reopenLocalDb, type LocalDb } from './connection';
import { runMigrations } from './migrate';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';

const BACKUP_PREFIX = 'analytiq-backup-';
const SAFETY_PREFIX = 'pre-restore-';

/** Tables every valid AnalytIQ database must contain. */
const REQUIRED_TABLES = ['users', 'products', 'sales', 'stock_movements', '__migrations'];

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupCheck {
  ok: boolean;
  error?: string;
  tables?: number;
}

export interface CreateBackupResult {
  backup: BackupInfo;
  pruned: number;
}

export interface RestoreResult {
  restored: BackupInfo;
  safetyBackup: BackupInfo;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

/** Default location beside the database file. */
export function backupDirFor(dbFilePath: string): string {
  return join(dirname(dbFilePath), 'backups');
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `YYYYMMDD-HHmmssSSS` — sortable, filename-safe on Windows. */
function stamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`
  );
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function infoOf(dir: string, name: string): BackupInfo {
  const stat = statSync(join(dir, name));
  return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
}

function isBackupFile(name: string): boolean {
  return BACKUP_NAME_PATTERN.test(name);
}

/** Newest first. Missing directory means "no backups yet". */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isBackupFile)
    .map((name) => infoOf(dir, name))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Open a snapshot read-only and prove it is a healthy AnalytIQ database.
 * Never throws: callers show the reason to the user.
 */
export function verifyBackup(file: string): BackupCheck {
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      return { ok: false, error: `SQLite integrity check failed (${String(integrity)})` };
    }
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name);
    const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
    if (missing.length > 0) {
      return { ok: false, error: `Not an AnalytIQ database (missing ${missing.join(', ')})` };
    }
    return { ok: true, tables: tables.length };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not read the file' };
  } finally {
    db?.close();
  }
}

/** Keep the newest `keep` app backups; pre-restore safety copies are kept. */
export function pruneBackups(dir: string, keep: number): number {
  const stale = listBackups(dir)
    .filter((item) => item.name.startsWith(BACKUP_PREFIX))
    .slice(Math.max(0, keep));
  for (const item of stale) rmSync(join(dir, item.name), { force: true });
  return stale.length;
}

function writeSnapshot(local: LocalDb, dir: string, prefix: string): BackupInfo {
  mkdirSync(dir, { recursive: true });
  const name = `${prefix}${stamp(new Date())}.db`;
  local.raw.prepare('VACUUM INTO ?').run(join(dir, name));
  const check = verifyBackup(join(dir, name));
  if (!check.ok) {
    rmSync(join(dir, name), { force: true });
    throw codedError(`The backup could not be verified: ${check.error}`, 'BACKUP_FAILED');
  }
  return infoOf(dir, name);
}

/** Manual backup: requires settings.manage and is recorded in the audit log. */
export function createBackup(
  local: LocalDb,
  dir: string,
  grants: string[],
  userId: string,
  businessId: string,
  keep = 14
): CreateBackupResult {
  requirePermission(new Set(grants), 'settings.manage');
  const backup = writeSnapshot(local, dir, BACKUP_PREFIX);
  const pruned = pruneBackups(dir, keep);
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'backup.create',
    entity: 'backup',
    entityId: backup.name,
    details: { sizeBytes: backup.sizeBytes, pruned },
  });
  return { backup, pruned };
}

export function dailyBackupDue(dir: string, now = new Date()): boolean {
  const today = dateKey(now.toISOString());
  return !listBackups(dir).some(
    (item) => item.name.startsWith(BACKUP_PREFIX) && dateKey(item.createdAt) === today
  );
}

/**
 * One automatic snapshot per calendar day. Called by the desktop app and the
 * LAN server on an hourly timer; it no-ops once today's file exists.
 */
export function runDailyBackupIfDue(
  local: LocalDb,
  dir: string,
  keep = 14
): CreateBackupResult | null {
  if (!dailyBackupDue(dir)) return null;
  const backup = writeSnapshot(local, dir, BACKUP_PREFIX);
  return { backup, pruned: pruneBackups(dir, keep) };
}

/**
 * Replace the live database with a verified snapshot.
 *
 * The current database is snapshotted first (`pre-restore-*.db`), then the
 * file handle is closed, the snapshot copied into place, migrations applied
 * and the shared connection reopened. The audit entry is written before the
 * swap so it is never lost when the restored copy predates this session.
 */
export function restoreBackup(
  local: LocalDb,
  dbFilePath: string,
  dir: string,
  grants: string[],
  userId: string,
  businessId: string,
  rawName: unknown
): RestoreResult {
  requirePermission(new Set(grants), 'settings.manage');
  const name = backupNameSchema.parse(rawName);
  const file = join(dir, name);
  if (!existsSync(file)) throw codedError('Backup not found', 'BACKUP_NOT_FOUND');

  const check = verifyBackup(file);
  if (!check.ok) {
    throw codedError(`This backup cannot be restored: ${check.error}`, 'BACKUP_INVALID');
  }

  writeAuditSync(local, {
    businessId,
    userId,
    action: 'backup.restore',
    entity: 'backup',
    entityId: name,
    details: { tables: check.tables },
  });

  const safetyBackup = writeSnapshot(local, dir, SAFETY_PREFIX);

  local.raw.pragma('wal_checkpoint(TRUNCATE)');
  closeLocalDb(local);
  try {
    rmSync(`${dbFilePath}-wal`, { force: true });
    rmSync(`${dbFilePath}-shm`, { force: true });
    copyFileSync(file, dbFilePath);
    runMigrations(dbFilePath);
  } finally {
    reopenLocalDb(local, dbFilePath);
  }

  return { restored: infoOf(dir, name), safetyBackup };
}

export function deleteBackup(
  local: LocalDb,
  dir: string,
  grants: string[],
  userId: string,
  businessId: string,
  rawName: unknown
): { removed: string } {
  requirePermission(new Set(grants), 'settings.manage');
  const name = backupNameSchema.parse(rawName);
  const file = join(dir, name);
  if (!existsSync(file)) throw codedError('Backup not found', 'BACKUP_NOT_FOUND');
  rmSync(file, { force: true });
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'backup.delete',
    entity: 'backup',
    entityId: name,
  });
  return { removed: name };
}
