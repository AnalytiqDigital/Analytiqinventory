// Per-business module installs. The business type picks the starting preset;
// a manager can switch optional modules on/off and the choice is stored per
// business, so two shops on the same PC (or branch) stay independent.

import {
  OPTIONAL_MODULES,
  moduleOverridesSchema,
  resolveModules,
  type AppModule,
  type OptionalModule,
} from '@analytiq/validation';
import { eq } from 'drizzle-orm';
import { newId } from './auth';
import { getModuleOverrides, setSetting } from './appSettings';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { auditLogs, businesses } from './schema';

const KEY = 'modules.overrides';

export interface ModuleInstallView {
  businessType: string;
  modules: AppModule[];
  overrides: Record<string, boolean>;
}

export async function businessTypeOf(local: LocalDb, businessId: string): Promise<string> {
  const [row] = await local.db
    .select({ type: businesses.type })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .all();
  return row?.type ?? 'other';
}

export async function resolveBusinessModules(
  local: LocalDb,
  businessId: string
): Promise<AppModule[]> {
  const [type, overrides] = await Promise.all([
    businessTypeOf(local, businessId),
    Promise.resolve(getModuleOverrides(local, businessId)),
  ]);
  return [...resolveModules(type, overrides)];
}

export async function getModuleInstallView(
  local: LocalDb,
  businessId: string
): Promise<ModuleInstallView> {
  const type = await businessTypeOf(local, businessId);
  const overrides = getModuleOverrides(local, businessId);
  return { businessType: type, modules: [...resolveModules(type, overrides)], overrides };
}

export async function setModuleInstall(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<ModuleInstallView> {
  requirePermission(new Set(grants), 'settings.manage');
  const input = moduleOverridesSchema.parse(raw);
  const allowed = new Set<string>(OPTIONAL_MODULES);
  const clean: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(input.overrides)) {
    if (!allowed.has(key)) continue;
    clean[key as OptionalModule] = on;
  }
  setSetting(local, businessId, KEY, JSON.stringify(clean));
  local.db
    .insert(auditLogs)
    .values({
      id: newId('aud'),
      businessId,
      userId,
      action: 'modules.install',
      entity: 'business',
      entityId: businessId,
      details: JSON.stringify({ overrides: clean }),
      createdAt: new Date(),
    })
    .run();
  return getModuleInstallView(local, businessId);
}

/** True when a module is installed for this business right now. */
export async function businessHasModule(
  local: LocalDb,
  businessId: string,
  module: OptionalModule
): Promise<boolean> {
  const modules = await resolveBusinessModules(local, businessId);
  return modules.includes(module);
}
