import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeLocalDb, openLocalDb } from './connection';

function resolveDbPath(): string {
  return process.env.ANALYTIQ_DB_PATH ?? join(process.cwd(), 'data', 'local.db');
}

function migrationsDir(): string {
  return join(__dirname, '..', 'drizzle');
}

// Minimal SQL migration runner: executes *.sql files in lexical order,
// splitting on drizzle's `--> statement-breakpoint` markers. This keeps
// Batch 3 independent of drizzle-kit snapshot artefacts while remaining a
// real file-based migration chain (every schema change = a new SQL file).
export function runMigrations(dbPath: string = resolveDbPath()): void {
  const local = openLocalDb(dbPath);
  try {
    local.raw.exec(`
      CREATE TABLE IF NOT EXISTS __migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
    const applied = new Set(
      local.raw.prepare('SELECT name FROM __migrations').all().map((r) => (r as { name: string }).name),
    );
    const files = readdirSync(migrationsDir())
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir(), file), 'utf8');
      const statements = sql
        .split(/-->\s*statement-breakpoint/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      local.raw.exec('BEGIN');
      try {
        for (const stmt of statements) local.raw.exec(stmt);
        local.raw
          .prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)')
          .run(file, Date.now());
        local.raw.exec('COMMIT');
      } catch (err) {
        try {
          local.raw.exec('ROLLBACK');
        } catch {
          // ignore rollback failure; surface the original error
        }
        throw err;
      }
    }
  } finally {
    closeLocalDb(local);
  }
}

if (require.main === module) {
  runMigrations();
  // eslint-disable-next-line no-console
  console.log('Migrations complete.');
}
