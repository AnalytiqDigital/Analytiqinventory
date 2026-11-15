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
