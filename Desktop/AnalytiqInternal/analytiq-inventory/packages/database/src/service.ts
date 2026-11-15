import { loginSchema, setupSchema, type LoginInput, type SetupInput } from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import type { LocalDb } from './connection';
import { hashPassword, hashToken, newId, newSessionToken, verifyPassword } from './auth';
import {
  ALL_PERMISSIONS,
  ADMIN_PERMISSIONS,
  CASHIER_PERMISSIONS,
  MANAGER_PERMISSIONS,
  type PermissionKey,
} from './permissions';
import {
  appSettings,
  auditLogs,
  businesses,
  locations,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from './schema';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  businessId: string;
  name: string;
  email: string;
  permissions: string[];
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
  expiresAt: Date;
}

function now(): Date {
  return new Date();
}

export function writeAuditSync(
  local: LocalDb,
  entry: { businessId: string; userId?: string; action: string; entity: string; entityId?: string; details?: unknown },
): void {
  local.db.insert(auditLogs).values({
    id: newId('aud'),
    businessId: entry.businessId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    details: JSON.stringify(entry.details ?? {}),
    createdAt: now(),
  }).run();
}

async function userPermissions(local: LocalDb, userId: string, businessId: string): Promise<string[]> {
  const assignments = await local.db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.businessId, businessId)));
  if (assignments.length === 0) return [];
  const grants = new Set<string>();
  for (const a of assignments) {
    const rows = await local.db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, a.roleId));
    for (const r of rows) grants.add(r.key);
  }
  return [...grants];
}

export async function isFirstRun(local: LocalDb): Promise<boolean> {
  const rows = await local.db.select({ id: users.id }).from(users).limit(1);
  return rows.length === 0;
}

export async function runSetup(
  local: LocalDb,
  raw: unknown,
): Promise<{ businessId: string; userId: string }> {
  const input: SetupInput = setupSchema.parse(raw);
  if (!(await isFirstRun(local))) {
    const err = new Error('Setup has already been completed');
    (err as NodeJS.ErrnoException).code = 'ALREADY_SETUP';
    throw err;
  }

  const timestamp = now();
  const businessId = newId('biz');
  const locationId = newId('loc');
  const adminRoleId = newId('rol');
  const managerRoleId = newId('rol');
  const cashierRoleId = newId('rol');
  const userId = newId('usr');

  const email = input.admin.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.admin.password);

  // better-sqlite3 is synchronous: wrap the whole seed in one sync
  // transaction so a failure rolls back instead of leaving a half setup.
  const seed = local.raw.transaction(() => {
    local.db.insert(businesses).values({
      id: businessId,
      name: input.business.name,
      type: input.business.type,
      address: input.business.address,
      phone: input.business.phone,
      email: input.business.email,
      state: input.business.state,
      lga: input.business.lga,
      currency: input.business.currency,
      taxLabel: input.business.taxLabel,
      taxRateBps: input.business.taxRateBps,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    local.db.insert(locations).values({
      id: locationId,
      businessId,
      name: input.location.name,
      address: input.location.address,
      state: input.location.state,
      lga: input.location.lga,
      isDefault: 1,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    for (const key of ALL_PERMISSIONS) {
      local.db.insert(permissions).values({ key, description: '' }).onConflictDoNothing().run();
    }
    const seedRole = (id: string, name: string, grants: PermissionKey[]): void => {
      local.db.insert(roles).values({
        id,
        businessId,
        name,
        description: `${name} (system)`,
        isSystem: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).run();
      for (const key of grants) {
        local.db.insert(rolePermissions).values({ roleId: id, permissionKey: key }).run();
      }
    };
    seedRole(adminRoleId, 'Administrator', ADMIN_PERMISSIONS);
    seedRole(managerRoleId, 'Manager', MANAGER_PERMISSIONS);
    seedRole(cashierRoleId, 'Cashier', CASHIER_PERMISSIONS);
    local.db.insert(users).values({
      id: userId,
      businessId,
      name: input.admin.name,
      email,
      passwordHash,
      isActive: 1,
      failedAttempts: 0,
      lockedUntil: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();
    local.db.insert(userRoles).values({ userId, roleId: adminRoleId, businessId }).run();
    local.db.insert(appSettings).values([
      { businessId, key: 'setup.completedAt', value: timestamp.toISOString(), updatedAt: timestamp },
      { businessId, key: 'business.currency', value: input.business.currency, updatedAt: timestamp },
    ]).run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'business.setup',
      entity: 'business',
      entityId: businessId,
      details: { locationId },
    });
  });
  seed();

  return { businessId, userId };
}

export async function login(local: LocalDb, raw: unknown): Promise<LoginResult> {
  const input: LoginInput = loginSchema.parse(raw);
  const email = input.email.trim().toLowerCase();

  const [user] = await local.db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.isActive !== 1) {
    const err = new Error('Invalid email or password');
    (err as NodeJS.ErrnoException).code = 'INVALID_CREDENTIALS';
    throw err;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const err = new Error('Account is temporarily locked. Try again later.');
    (err as NodeJS.ErrnoException).code = 'ACCOUNT_LOCKED';
    throw err;
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = user.failedAttempts + 1;
    const locked = failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    const recordFailure = local.raw.transaction(() => {
      local.db
        .update(users)
        .set({ failedAttempts: failed, lockedUntil: locked, updatedAt: now() })
        .where(eq(users.id, user.id)).run();
      writeAuditSync(local, {
        businessId: user.businessId,
        userId: user.id,
        action: 'auth.login.failed',
        entity: 'user',
        entityId: user.id,
      });
    });
    recordFailure();
    const err = new Error(
      locked ? 'Account is temporarily locked. Try again later.' : 'Invalid email or password',
    );
    (err as NodeJS.ErrnoException).code = locked ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS';
    throw err;
  }

  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const recordLogin = local.raw.transaction(() => {
    local.db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now() })
      .where(eq(users.id, user.id)).run();
    local.db.insert(sessions).values({
      id: newId('ses'),
      userId: user.id,
      businessId: user.businessId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      createdAt: now(),
    }).run();
    writeAuditSync(local, {
      businessId: user.businessId,
      userId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
    });
  });
  recordLogin();

  const grants = await userPermissions(local, user.id, user.businessId);
  return {
    token,
    expiresAt,
    user: { id: user.id, businessId: user.businessId, name: user.name, email: user.email, permissions: grants },
  };
}

export async function logout(local: LocalDb, token: string): Promise<void> {
  await local.db
    .update(sessions)
    .set({ revokedAt: now() })
    .where(eq(sessions.tokenHash, hashToken(token))).run();
}

export async function authenticate(local: LocalDb, token: string): Promise<AuthenticatedUser | null> {
  const [session] = await local.db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  const [user] = await local.db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.isActive !== 1) return null;
  const grants = await userPermissions(local, user.id, user.businessId);
  return { id: user.id, businessId: user.businessId, name: user.name, email: user.email, permissions: grants };
}
