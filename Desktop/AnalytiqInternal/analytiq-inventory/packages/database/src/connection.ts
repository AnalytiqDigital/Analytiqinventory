import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

export interface LocalDb {
  raw: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

export function openLocalDb(filePath: string): LocalDb {
  mkdirSync(dirname(filePath), { recursive: true });
  const raw = new Database(filePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });
  return { raw, db };
}

export function closeLocalDb(local: LocalDb): void {
  local.raw.close();
}

/**
 * Re-open the same file after an offline restore. Mutates the shared LocalDb
 * so every caller (IPC handlers, Fastify routes, Drizzle queries) keeps
 * working without rebuilding its references.
 */
export function reopenLocalDb(local: LocalDb, filePath: string): void {
  const raw = new Database(filePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  local.raw = raw;
  local.db = drizzle(raw, { schema });
}
