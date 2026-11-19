// Batch 8: multi-branch sync.
//
// Model: each installation keeps its own SQLite file. A "hub" (the primary
// computer or a small cloud relay running @analytiq/local-server) stores the
// newest snapshot of every synced row in `sync_records` with a monotonic
// `seq`. Branches push rows they changed (cursor = updated_at + id) and pull
// rows they have not seen (cursor = seq). Merge is last-write-wins on
// version/updated_at, and stock movements are append-only.
//
// Sales, purchases and their children are deliberately not synced: they are
// ledger documents that belong to the till that recorded them. Catalog,
// contacts, tables and the stock ledger are shared so every branch sells the
// same products at the same prices.

import { syncConfigSchema } from '@analytiq/validation';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';

export type SyncEntity =
  | 'locations'
  | 'categories'
  | 'tax_categories'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'dining_tables'
  | 'stock_movements';

interface EntitySpec {
  table: string;
  cursorColumn: 'updated_at' | 'created_at';
  appendOnly: boolean;
}

// Order matters: parents before children when applying.
const ENTITIES: SyncEntity[] = [
  'locations',
  'categories',
  'tax_categories',
  'products',
  'customers',
  'suppliers',
  'dining_tables',
  'stock_movements',
];

const SPECS: Record<SyncEntity, EntitySpec> = {
  locations: { table: 'locations', cursorColumn: 'updated_at', appendOnly: false },
  categories: { table: 'categories', cursorColumn: 'updated_at', appendOnly: false },
  tax_categories: { table: 'tax_categories', cursorColumn: 'updated_at', appendOnly: false },
  products: { table: 'products', cursorColumn: 'updated_at', appendOnly: false },
  customers: { table: 'customers', cursorColumn: 'updated_at', appendOnly: false },
  suppliers: { table: 'suppliers', cursorColumn: 'updated_at', appendOnly: false },
  dining_tables: { table: 'dining_tables', cursorColumn: 'updated_at', appendOnly: false },
  stock_movements: { table: 'stock_movements', cursorColumn: 'created_at', appendOnly: true },
};

const SETTINGS_KEY = 'sync.settings';
const STATUS_KEY = 'sync.status';
const PUSH_CURSOR_KEY = 'sync.push.cursor';
const PULL_CURSOR_KEY = 'sync.pull.seq';

const MAX_BATCH = 500;
const MAX_RECORD_KEYS = 64;

export interface SyncCursor {
  ts: number;
  id: string;
}

export interface SyncRecord {
  entity: SyncEntity;
  id: string;
  version: number;
  updatedAt: number;
  data: Record<string, unknown>;
}

export interface SyncSettings {
  url: string;
  key: string;
  enabled: boolean;
}

export interface SyncStatus {
  settings: SyncSettings;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
}

export interface SyncResult {
  ok: true;
  pushed: number;
  pulled: number;
  cursor: number;
  finishedAt: string;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function isEntity(value: unknown): value is SyncEntity {
  return typeof value === 'string' && (ENTITIES as string[]).includes(value);
}

/** Runtime list/guard for callers that validate untrusted entity names. */
export const SYNC_ENTITIES: readonly SyncEntity[] = ENTITIES;

export function isSyncEntity(value: unknown): value is SyncEntity {
  return isEntity(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readState(local: LocalDb, businessId: string, key: string): string | null {
  const row = local.raw
    .prepare('SELECT value FROM sync_state WHERE business_id = ? AND key = ?')
    .get(businessId, key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeState(local: LocalDb, businessId: string, key: string, value: string): void {
  local.raw
    .prepare(
      `INSERT INTO sync_state (business_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (business_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(businessId, key, value, Math.floor(Date.now() / 1000));
}

function deleteState(local: LocalDb, businessId: string, key: string): void {
  local.raw
    .prepare('DELETE FROM sync_state WHERE business_id = ? AND key = ?')
    .run(businessId, key);
}

const columnCache = new Map<string, string[]>();

function columnsOf(local: LocalDb, table: string): string[] {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = local.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const columns = rows.map((row) => row.name);
  columnCache.set(table, columns);
  return columns;
}

function exists(local: LocalDb, table: string, id: string): boolean {
  const row = local.raw.prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? LIMIT 1`).get(id);
  return row !== undefined;
}

function sanitizeData(
  local: LocalDb,
  table: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(columnsOf(local, table));
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!allowed.has(key)) continue;
    if (key === 'business_id' || key === 'id') continue;
    if (value === undefined || typeof value === 'object') continue;
    clean[key] = value;
  }
  // A movement can arrive before the staff member who made it is known here.
  if (typeof clean.user_id === 'string' && !exists(local, 'users', clean.user_id)) {
    clean.user_id = null;
  }
  return clean;
}

function parseRecord(raw: unknown): SyncRecord | null {
  if (!isPlainObject(raw)) return null;
  if (!isEntity(raw.entity)) return null;
  if (typeof raw.id !== 'string' || raw.id.length === 0 || raw.id.length > 120) return null;
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) return null;
  if (!Number.isInteger(raw.updatedAt) || (raw.updatedAt as number) < 0) return null;
  if (!isPlainObject(raw.data)) return null;
  if (Object.keys(raw.data).length > MAX_RECORD_KEYS) return null;
  return {
    entity: raw.entity,
    id: raw.id,
    version: raw.version as number,
    updatedAt: raw.updatedAt as number,
    data: raw.data,
  };
}

// --- local capture ----------------------------------------------------------

export interface CollectResult {
  records: SyncRecord[];
  cursors: Record<string, SyncCursor>;
  hasMore: boolean;
}

/**
 * Rows changed since each entity's cursor, in (timestamp, id) order so a
 * second-resolution timestamp can never skip rows written in the same second.
 */
export function collectChanges(
  local: LocalDb,
  businessId: string,
  cursors: Record<string, SyncCursor> = {},
  limit = MAX_BATCH
): CollectResult {
  const records: SyncRecord[] = [];
  const next: Record<string, SyncCursor> = { ...cursors };
  let hasMore = false;

  for (const entity of ENTITIES) {
    const spec = SPECS[entity];
    const cursor = cursors[entity] ?? { ts: 0, id: '' };
    const rows = local.raw
      .prepare(
        `SELECT * FROM ${spec.table}
          WHERE business_id = ?
            AND (${spec.cursorColumn} > ? OR (${spec.cursorColumn} = ? AND id > ?))
          ORDER BY ${spec.cursorColumn} ASC, id ASC
          LIMIT ?`
      )
      .all(businessId, cursor.ts, cursor.ts, cursor.id, limit) as Array<Record<string, unknown>>;

    if (rows.length === 0) continue;
    if (rows.length === limit) hasMore = true;

    for (const row of rows) {
      const id = String(row.id);
      const ts = Number(row[spec.cursorColumn] ?? 0);
      const version = Number(row.version ?? 1);
      records.push({ entity, id, version, updatedAt: ts, data: { ...row } });
      next[entity] = { ts, id };
    }
  }

  return { records, cursors: next, hasMore };
}

// --- merge ------------------------------------------------------------------

function upsertSql(local: LocalDb, record: SyncRecord, table: string): string {
  const data = sanitizeData(local, table, record.data);
  const columns = ['id', 'business_id', ...Object.keys(data)];
  const placeholders = columns.map(() => '?').join(', ');
  const updates = Object.keys(data)
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  const insert = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  if (SPECS[record.entity].appendOnly || updates.length === 0) {
    return `${insert} ON CONFLICT (id) DO NOTHING`;
  }
  return `${insert} ON CONFLICT (id) DO UPDATE SET ${updates}
          WHERE excluded.version > ${table}.version
             OR (excluded.version = ${table}.version AND excluded.updated_at >= ${table}.updated_at)`;
}

/**
 * Apply remote rows locally. Parents are applied before children, stale rows
 * are ignored (LWW), and a row that fails a local constraint (e.g. a duplicate
 * SKU) is skipped rather than aborting the batch.
 */
export function applyRecords(
  local: LocalDb,
  businessId: string,
  raws: unknown[]
): { applied: number; skipped: number } {
  const records: SyncRecord[] = [];
  let skipped = 0;
  for (const raw of raws) {
    const record = parseRecord(raw);
    if (record) records.push(record);
    else skipped += 1;
  }
  records.sort((a, b) => ENTITIES.indexOf(a.entity) - ENTITIES.indexOf(b.entity));

  let applied = 0;
  const run = local.raw.transaction(() => {
    for (const record of records) {
      const table = SPECS[record.entity].table;
      const data = sanitizeData(local, table, record.data);
      const values = [record.id, businessId, ...Object.values(data)];
      try {
        local.raw.prepare(upsertSql(local, record, table)).run(...values);
        applied += 1;
      } catch {
        skipped += 1;
      }
    }
  });
  run();
  return { applied, skipped };
}

// --- relay side (hub) -------------------------------------------------------

export function ingestRecords(
  local: LocalDb,
  businessId: string,
  raws: unknown[]
): { applied: number; skipped: number } {
  const records: SyncRecord[] = [];
  let skipped = 0;
  for (const raw of raws) {
    const record = parseRecord(raw);
    if (record) records.push(record);
    else skipped += 1;
  }

  const current = local.raw
    .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_records WHERE business_id = ?')
    .get(businessId) as { seq: number };
  let seq = current.seq;

  const store = local.raw.transaction(() => {
    for (const record of records) {
      seq += 1;
      local.raw
        .prepare(
          `INSERT INTO sync_records (business_id, entity, entity_id, version, updated_at, seq, data)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (business_id, entity, entity_id) DO UPDATE SET
             version = excluded.version,
             updated_at = excluded.updated_at,
             seq = excluded.seq,
             data = excluded.data
           WHERE excluded.version > sync_records.version
              OR (excluded.version = sync_records.version AND excluded.updated_at >= sync_records.updated_at)`
        )
        .run(
          businessId,
          record.entity,
          record.id,
          record.version,
          record.updatedAt,
          seq,
          JSON.stringify(record.data)
        );
    }
  });
  store();

  const result = applyRecords(local, businessId, records);
  return { applied: result.applied, skipped: skipped + result.skipped };
}

/**
 * One page of a single entity's history. Pulling entity by entity keeps
 * parents (products, locations) ahead of the stock movements that reference
 * them, regardless of how the hub interleaved the arrivals.
 */
export function listRecordsSince(
  local: LocalDb,
  businessId: string,
  entity: SyncEntity,
  since: number,
  limit = MAX_BATCH
): { records: SyncRecord[]; cursor: number; hasMore: boolean } {
  const rows = local.raw
    .prepare(
      `SELECT * FROM sync_records
        WHERE business_id = ? AND entity = ? AND seq > ?
        ORDER BY seq ASC LIMIT ?`
    )
    .all(businessId, entity, since, limit) as Array<{
    entity: string;
    entity_id: string;
    version: number;
    updated_at: number;
    seq: number;
    data: string;
  }>;

  const records: SyncRecord[] = [];
  for (const row of rows) {
    if (!isEntity(row.entity)) continue;
    let data: unknown;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (!isPlainObject(data)) continue;
    records.push({
      entity: row.entity,
      id: row.entity_id,
      version: row.version,
      updatedAt: row.updated_at,
      data,
    });
  }
  const last = rows[rows.length - 1];
  const cursor = last ? last.seq : since;
  return { records, cursor, hasMore: rows.length === limit };
}

// --- settings + status ------------------------------------------------------

export function getSyncSettings(local: LocalDb, businessId: string): SyncSettings {
  const raw = readState(local, businessId, SETTINGS_KEY);
  if (!raw) return { url: '', key: '', enabled: false };
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      key: typeof parsed.key === 'string' ? parsed.key : '',
      enabled: parsed.enabled === true,
    };
  } catch {
    return { url: '', key: '', enabled: false };
  }
}

export function setSyncSettings(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): SyncSettings {
  requirePermission(new Set(grants), 'settings.manage');
  const input = syncConfigSchema.parse(raw);
  const previous = getSyncSettings(local, businessId);
  const settings: SyncSettings = {
    url: input.url.replace(/\/+$/, ''),
    key: input.key,
    enabled: input.enabled,
  };
  if (settings.enabled && (!settings.url || !settings.key)) {
    throw codedError('A sync URL and key are required to enable sync', 'SYNC_INVALID');
  }
  writeState(local, businessId, SETTINGS_KEY, JSON.stringify(settings));
  // A new hub means new history; re-pull from the beginning on the next run.
  if (settings.url !== previous.url || settings.key !== previous.key) {
    deleteState(local, businessId, PULL_CURSOR_KEY);
    deleteState(local, businessId, PUSH_CURSOR_KEY);
  }
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'sync.configured',
    entity: 'sync',
    details: { url: settings.url, enabled: settings.enabled },
  });
  return settings;
}

export function getSyncStatus(local: LocalDb, businessId: string): SyncStatus {
  const settings = getSyncSettings(local, businessId);
  const raw = readState(local, businessId, STATUS_KEY);
  if (!raw) return { settings, lastPushAt: null, lastPullAt: null, lastError: null };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      settings,
      lastPushAt: typeof parsed.lastPushAt === 'string' ? parsed.lastPushAt : null,
      lastPullAt: typeof parsed.lastPullAt === 'string' ? parsed.lastPullAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
    };
  } catch {
    return { settings, lastPushAt: null, lastPullAt: null, lastError: null };
  }
}

// --- transport + orchestration ---------------------------------------------

export interface SyncTransport {
  push(records: SyncRecord[]): Promise<{ applied: number }>;
  pull(
    entity: SyncEntity,
    since: number,
    limit: number
  ): Promise<{
    records: SyncRecord[];
    cursor: number;
    hasMore: boolean;
  }>;
}

export function httpTransport(
  baseUrl: string,
  key: string,
  fetchImpl: typeof fetch = fetch
): SyncTransport {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(pathname: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchImpl(`${base}${pathname}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-sync-key': key,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw codedError('The sync server returned an invalid response', 'SYNC_BAD_RESPONSE');
      }
    }
    if (!response.ok) {
      const message =
        typeof body.error === 'string' ? body.error : `Sync failed (${response.status})`;
      throw codedError(message, typeof body.code === 'string' ? body.code : 'SYNC_FAILED');
    }
    return body;
  }

  return {
    async push(records) {
      const body = await call('/sync/push', { method: 'POST', body: JSON.stringify({ records }) });
      const applied = typeof body.applied === 'number' ? body.applied : 0;
      return { applied };
    },
    async pull(entity, since, limit) {
      const body = await call(
        `/sync/pull?entity=${encodeURIComponent(entity)}&since=${since}&limit=${limit}`,
        { method: 'GET' }
      );
      const records = Array.isArray(body.records) ? (body.records as SyncRecord[]) : [];
      const cursor = typeof body.cursor === 'number' ? body.cursor : since;
      return { records, cursor, hasMore: body.hasMore === true };
    },
  };
}

function readCursors(local: LocalDb, businessId: string): Record<string, SyncCursor> {
  const raw = readState(local, businessId, PUSH_CURSOR_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cursors: Record<string, SyncCursor> = {};
    for (const entity of ENTITIES) {
      const value = parsed[entity];
      if (!isPlainObject(value)) continue;
      if (typeof value.ts !== 'number' || typeof value.id !== 'string') continue;
      cursors[entity] = { ts: value.ts, id: value.id };
    }
    return cursors;
  } catch {
    return {};
  }
}

function readPullCursors(local: LocalDb, businessId: string): Partial<Record<SyncEntity, number>> {
  const raw = readState(local, businessId, PULL_CURSOR_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const cursors: Partial<Record<SyncEntity, number>> = {};
    for (const entity of ENTITIES) {
      const value = parsed[entity];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        cursors[entity] = value;
      }
    }
    return cursors;
  } catch {
    return {};
  }
}

/**
 * Push local changes, then pull remote ones. Safe to call repeatedly: pushes
 * are idempotent snapshots and cursors only advance after a successful batch.
 */
export async function syncNow(
  local: LocalDb,
  businessId: string,
  transport: SyncTransport,
  options: { maxPages?: number } = {}
): Promise<SyncResult> {
  const settings = getSyncSettings(local, businessId);
  if (!settings.enabled) throw codedError('Sync is turned off', 'SYNC_DISABLED');
  const maxPages = options.maxPages ?? 20;

  let pushed = 0;
  let pulled = 0;

  try {
    let cursors = readCursors(local, businessId);
    for (let page = 0; page < maxPages; page += 1) {
      const batch = collectChanges(local, businessId, cursors, MAX_BATCH);
      if (batch.records.length === 0) break;
      await transport.push(batch.records);
      pushed += batch.records.length;
      cursors = batch.cursors;
      writeState(local, businessId, PUSH_CURSOR_KEY, JSON.stringify(cursors));
      if (!batch.hasMore) break;
    }

    const pullCursors = readPullCursors(local, businessId);
    let cursor = 0;
    for (const entity of ENTITIES) {
      let entityCursor = pullCursors[entity] ?? 0;
      for (let page = 0; page < maxPages; page += 1) {
        const batch = await transport.pull(entity, entityCursor, MAX_BATCH);
        if (batch.records.length > 0) {
          const applied = applyRecords(local, businessId, batch.records);
          pulled += applied.applied;
        }
        entityCursor = batch.cursor;
        pullCursors[entity] = entityCursor;
        writeState(local, businessId, PULL_CURSOR_KEY, JSON.stringify(pullCursors));
        if (!batch.hasMore) break;
      }
      cursor = entityCursor;
    }

    const finishedAt = new Date().toISOString();
    writeState(
      local,
      businessId,
      STATUS_KEY,
      JSON.stringify({ lastPushAt: finishedAt, lastPullAt: finishedAt, lastError: null })
    );
    return { ok: true, pushed, pulled, cursor, finishedAt };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    const previous = getSyncStatus(local, businessId);
    writeState(
      local,
      businessId,
      STATUS_KEY,
      JSON.stringify({
        lastPushAt: previous.lastPushAt,
        lastPullAt: previous.lastPullAt,
        lastError: message,
      })
    );
    throw err;
  }
}
