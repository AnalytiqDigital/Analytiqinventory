// Batch 15: encrypted off-PC backup.
//
// Opt-in. The app already writes a daily verified snapshot beside the
// database; this adds an AES-256-GCM encrypted copy that can be PUT to an
// owner-controlled HTTPS endpoint (their cloud bucket, NAS bridge, etc.).
//
// File format: "ANALYTIQ-BKP1" + 16-byte scrypt salt + 12-byte IV +
// 16-byte GCM tag + ciphertext. The passphrase never leaves the machine except
// through this encrypted container, and the upload is disabled until the owner
// switches it on in Settings.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cloudBackupSettingsSchema } from '@analytiq/validation';
import { eq } from 'drizzle-orm';
import { newId } from './auth';
import { getJsonSetting, setSetting } from './appSettings';
import { createBackup, listBackups, type BackupInfo } from './backups';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { backupUploads, businesses } from './schema';
import { writeAuditSync } from './service';

const KEY = 'backup.cloud';
const MAGIC = Buffer.from('ANALYTIQ-BKP1', 'ascii');

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export interface CloudBackupSettings {
  enabled: boolean;
  url: string;
  key: string;
  passphrase: string;
  keepLocal: boolean;
}

export interface CloudBackupView extends Omit<CloudBackupSettings, 'key' | 'passphrase'> {
  keySet: boolean;
  passphraseSet: boolean;
}

export const DEFAULT_CLOUD_BACKUP: CloudBackupSettings = {
  enabled: false,
  url: '',
  key: '',
  passphrase: '',
  keepLocal: true,
};

export function getCloudBackupSettings(local: LocalDb, businessId: string): CloudBackupSettings {
  return (
    getJsonSetting<CloudBackupSettings>(local, businessId, KEY) ?? { ...DEFAULT_CLOUD_BACKUP }
  );
}

export function cloudBackupView(settings: CloudBackupSettings): CloudBackupView {
  const { key, passphrase, ...rest } = settings;
  return { ...rest, keySet: key !== '', passphraseSet: passphrase !== '' };
}

export function setCloudBackupSettings(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): CloudBackupView {
  requirePermission(new Set(grants), 'settings.manage');
  const input = cloudBackupSettingsSchema.parse(raw);
  const existing = getCloudBackupSettings(local, businessId);
  const settings: CloudBackupSettings = {
    enabled: input.enabled,
    url: input.url.replace(/\/+$/, ''),
    key: input.key || existing.key,
    passphrase: input.passphrase || existing.passphrase,
    keepLocal: input.keepLocal,
  };
  if (settings.enabled) {
    if (!settings.url) throw codedError('Add the upload URL', 'CLOUD_BACKUP_INVALID');
    if (!settings.passphrase) {
      throw codedError('Set an encryption passphrase before enabling uploads', 'CLOUD_BACKUP_INVALID');
    }
  }
  setSetting(local, businessId, KEY, JSON.stringify(settings));
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'backup.cloud_settings',
    entity: 'business',
    entityId: businessId,
    details: { enabled: settings.enabled, url: settings.url },
  });
  return cloudBackupView(settings);
}

/** Encrypt a file into the AnalytIQ container format. */
export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  if (passphrase.length < 8) {
    throw codedError('Use a passphrase of at least 8 characters', 'CLOUD_BACKUP_PASSPHRASE');
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(container: Buffer, passphrase: string): Buffer {
  const headerLength = MAGIC.length + 16 + 12 + 16;
  if (container.length <= headerLength || !container.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw codedError('This is not an AnalytIQ encrypted backup', 'CLOUD_BACKUP_FORMAT');
  }
  let offset = MAGIC.length;
  const salt = container.subarray(offset, offset + 16);
  offset += 16;
  const iv = container.subarray(offset, offset + 12);
  offset += 12;
  const tag = container.subarray(offset, offset + 16);
  offset += 16;
  const ciphertext = container.subarray(offset);
  try {
    const key = scryptSync(passphrase, salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw codedError('Wrong passphrase or damaged backup', 'CLOUD_BACKUP_DECRYPT');
  }
}

export interface EncryptedBackupResult {
  fileName: string;
  sizeBytes: number;
  uploaded: boolean;
}

/**
 * Snapshot → encrypt → optionally upload. The encrypted file stays beside the
 * local backups when `keepLocal` is on (it is still encrypted at rest).
 */
export async function runEncryptedCloudBackup(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  backupsDir: string,
  options: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<EncryptedBackupResult> {
  requirePermission(new Set(grants), 'settings.manage');
  const settings = getCloudBackupSettings(local, businessId);
  if (!settings.enabled) throw codedError('Cloud backup is switched off', 'CLOUD_BACKUP_DISABLED');
  if (!settings.url) throw codedError('Add the upload URL', 'CLOUD_BACKUP_INVALID');
  if (!settings.passphrase) throw codedError('Set a passphrase first', 'CLOUD_BACKUP_INVALID');

  const backup: BackupInfo = createBackup(local, backupsDir, grants, userId, businessId).backup;
  const source = join(backupsDir, backup.name);
  const plain = readFileSync(source);
  const encrypted = encryptBuffer(plain, settings.passphrase);
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const fileName = `analytiq-offsite-${stamp}.aqb`;
  const output = join(backupsDir, fileName);
  writeFileSync(output, encrypted);

  const uploadId = newId('upr');
  const createdAt = options.now ?? new Date();
  let uploaded = false;
  try {
    const response = await (options.fetchImpl ?? fetch)(settings.url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(encrypted.length),
        ...(settings.key ? { authorization: `Bearer ${settings.key}` } : {}),
        'x-analytiq-file': fileName,
      },
      body: new Uint8Array(encrypted),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw codedError(`Upload rejected (${response.status})`, 'CLOUD_BACKUP_UPLOAD');
    }
    uploaded = true;
    local.db
      .insert(backupUploads)
      .values({
        id: uploadId,
        businessId,
        fileName,
        sizeBytes: encrypted.length,
        status: 'sent',
        error: '',
        createdAt,
      })
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'backup.cloud_upload',
      entity: 'backup',
      entityId: fileName,
      details: { sizeBytes: encrypted.length },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    local.db
      .insert(backupUploads)
      .values({
        id: uploadId,
        businessId,
        fileName,
        sizeBytes: encrypted.length,
        status: 'failed',
        error: message.slice(0, 500),
        createdAt,
      })
      .run();
    throw codedError(message, 'CLOUD_BACKUP_UPLOAD');
  } finally {
    if (!settings.keepLocal) rmSync(output, { force: true });
  }

  return { fileName, sizeBytes: encrypted.length, uploaded };
}

export interface UploadRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: string;
  error: string;
  createdAt: string;
}

export function listCloudUploads(
  local: LocalDb,
  businessId: string,
  limit = 10
): UploadRow[] {
  const rows = local.raw
    .prepare(
      `SELECT id, file_name AS fileName, size_bytes AS sizeBytes, status, error, created_at AS createdAtMs
         FROM backup_uploads WHERE business_id = ?
        ORDER BY created_at DESC, rowid DESC LIMIT ?`
    )
    .all(businessId, Math.min(Math.max(limit, 1), 50)) as Array<{
    id: string;
    fileName: string;
    sizeBytes: number;
    status: string;
    error: string;
    createdAtMs: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    sizeBytes: r.sizeBytes,
    status: r.status,
    error: r.error,
    createdAt: new Date(r.createdAtMs * 1000).toISOString(),
  }));
}

/** Newest local snapshots, for "backup now" without duplicating a snapshot. */
export function newestLocalBackup(backupsDir: string): BackupInfo | null {
  return listBackups(backupsDir)[0] ?? null;
}

export async function businessNameOf(local: LocalDb, businessId: string): Promise<string> {
  const [row] = await local.db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .all();
  return row?.name ?? '';
}
