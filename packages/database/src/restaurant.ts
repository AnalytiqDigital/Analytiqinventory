// Restaurant service-flow defaults: the service charge the POS pre-fills.
// Stored per business in app_settings so every till sees the same preset.

import { restaurantSettingsSchema } from '@analytiq/validation';
import { getJsonSetting, setSetting } from './appSettings';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';

const KEY = 'restaurant.settings';

export interface RestaurantSettings {
  serviceChargeBp: number;
}

export function getRestaurantSettings(local: LocalDb, businessId: string): RestaurantSettings {
  const raw = getJsonSetting<Partial<RestaurantSettings>>(local, businessId, KEY);
  const bp = Number(raw?.serviceChargeBp ?? 0);
  return {
    serviceChargeBp: Number.isFinite(bp) ? Math.min(Math.max(Math.round(bp), 0), 5000) : 0,
  };
}

export async function setRestaurantSettings(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ settings: RestaurantSettings }> {
  requirePermission(new Set(grants), 'settings.manage');
  const input = restaurantSettingsSchema.parse(raw ?? {});
  setSetting(local, businessId, KEY, JSON.stringify(input));
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'restaurant.settings',
    entity: 'business',
    entityId: businessId,
    details: input,
  });
  return { settings: input };
}
