// Small typed helpers over the key/value `app_settings` table.
// Values are stored as text; callers own the JSON shape.

import { and, eq } from 'drizzle-orm';
import type { LocalDb } from './connection';
import { appSettings } from './schema';

export function getSetting(local: LocalDb, businessId: string, key: string): string | null {
  const [row] = local.db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(and(eq(appSettings.businessId, businessId), eq(appSettings.key, key)))
    .limit(1)
    .all();
  return row?.value ?? null;
}

export function getJsonSetting<T>(local: LocalDb, businessId: string, key: string): T | null {
  const raw = getSetting(local, businessId, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setSetting(
  local: LocalDb,
  businessId: string,
  key: string,
  value: string
): void {
  // app_settings predates a unique key, so update-then-insert rather than
  // relying on ON CONFLICT.
  const updated = local.raw
    .prepare('UPDATE app_settings SET value = ?, updated_at = ? WHERE business_id = ? AND key = ?')
    .run(value, Math.floor(Date.now() / 1000), businessId, key);
  if (updated.changes === 0) {
    local.db.insert(appSettings).values({
      businessId,
      key,
      value,
      updatedAt: new Date(),
    }).run();
  }
}

/** Per-business module switches. Missing key = use the business-type preset. */
export function getModuleOverrides(
  local: LocalDb,
  businessId: string
): Record<string, boolean> {
  return getJsonSetting<Record<string, boolean>>(local, businessId, 'modules.overrides') ?? {};
}
