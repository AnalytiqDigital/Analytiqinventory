// Batch 14: staff accounts and editable role permissions.
//
// Roles stay locked to the three built-ins (Administrator / Manager /
// Cashier); only their permission sets are editable. Two guards prevent
// lock-outs: the Administrator role always keeps staff.manage and
// settings.manage, and nobody can remove staff.manage from a role they hold.

import {
  rolePermissionsSchema,
  staffCreateSchema,
  staffPasswordSchema,
  staffUpdateSchema,
} from '@analytiq/validation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { hashPassword, newId } from './auth';
import type { LocalDb } from './connection';
import { ALL_PERMISSIONS, requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { rolePermissions, roles, sessions, userRoles, users } from './schema';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roleId: string | null;
  roleName: string;
  createdAt: string;
}

export interface StaffRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

async function staffManagers(local: LocalDb, businessId: string): Promise<number> {
  const row = local.raw
    .prepare(
      `SELECT COUNT(DISTINCT u.id) AS n
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
         JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE u.business_id = ? AND u.is_active = 1 AND rp.permission_key = 'staff.manage'`
    )
    .get(businessId) as { n: number } | undefined;
  return row?.n ?? 0;
}

async function roleGrants(local: LocalDb, roleId: string): Promise<Set<string>> {
  const rows = await local.db
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  return new Set(rows.map((r) => r.key));
}

async function loadStaff(local: LocalDb, businessId: string, userId: string): Promise<StaffMember> {
  const rows = await local.db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      roleId: roles.id,
      roleName: roles.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.businessId, businessId)))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.businessId, businessId), eq(users.id, userId)));
  const first = rows[0];
  if (!first) throw codedError('Staff member not found', 'STAFF_NOT_FOUND');
  return {
    id: first.id,
    name: first.name,
    email: first.email,
    isActive: first.isActive === 1,
    roleId: first.roleId ?? null,
    roleName: rows
      .map((r) => r.roleName)
      .filter(Boolean)
      .join(', '),
    createdAt: iso(first.createdAt),
  };
}

export async function listStaff(
  local: LocalDb,
  businessId: string,
  grants: string[]
): Promise<{ items: StaffMember[] }> {
  requirePermission(new Set(grants), 'staff.manage');
  const rows = await local.db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      roleId: roles.id,
      roleName: roles.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.businessId, businessId)))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.businessId, businessId));

  const byId = new Map<string, StaffMember>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (existing) {
      if (row.roleName && !existing.roleName.includes(row.roleName)) {
        existing.roleName = existing.roleName
          ? `${existing.roleName}, ${row.roleName}`
          : row.roleName;
      }
      continue;
    }
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      email: row.email,
      isActive: row.isActive === 1,
      roleId: row.roleId ?? null,
      roleName: row.roleName ?? '',
      createdAt: iso(row.createdAt),
    });
  }
  return {
    items: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function createStaff(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  raw: unknown
): Promise<{ staff: StaffMember }> {
  requirePermission(new Set(grants), 'staff.manage');
  const input = staffCreateSchema.parse(raw);

  const [role] = await local.db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(and(eq(roles.id, input.roleId), eq(roles.businessId, businessId)))
    .limit(1);
  if (!role) throw codedError('Role not found', 'ROLE_NOT_FOUND');

  const [existing] = await local.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.businessId, businessId), eq(users.email, input.email)))
    .limit(1);
  if (existing) throw codedError('A staff member with that email already exists', 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(input.password);
  const id = newId('usr');
  const now = new Date();

  const write = local.raw.transaction(() => {
    local.db
      .insert(users)
      .values({
        id,
        businessId,
        name: input.name,
        email: input.email,
        passwordHash,
        isActive: 1,
        failedAttempts: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    local.db.insert(userRoles).values({ userId: id, roleId: role.id, businessId }).run();
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'staff.create',
      entity: 'user',
      entityId: id,
      details: { email: input.email, role: role.name },
    });
  });
  write();

  return { staff: await loadStaff(local, businessId, id) };
}

export async function updateStaff(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  userId: string,
  raw: unknown
): Promise<{ staff: StaffMember }> {
  requirePermission(new Set(grants), 'staff.manage');
  const input = staffUpdateSchema.parse(raw);

  const [target] = await local.db
    .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
    .limit(1);
  if (!target) throw codedError('Staff member not found', 'STAFF_NOT_FOUND');

  const isSelf = userId === actorId;
  if (isSelf && input.isActive === false) {
    throw codedError('You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF');
  }
  if (isSelf && input.roleId) {
    throw codedError('You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE');
  }

  let newRoleName = '';
  if (input.roleId) {
    const [role] = await local.db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.businessId, businessId)))
      .limit(1);
    if (!role) throw codedError('Role not found', 'ROLE_NOT_FOUND');
    newRoleName = role.name;
  }

  const assignments = await local.db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.businessId, businessId)));
  let holdsStaffManage = false;
  for (const a of assignments) {
    if ((await roleGrants(local, a.roleId)).has('staff.manage')) holdsStaffManage = true;
  }

  let keepsStaffManage = holdsStaffManage;
  if (input.isActive === false) keepsStaffManage = false;
  if (input.roleId) keepsStaffManage = (await roleGrants(local, input.roleId)).has('staff.manage');

  if (holdsStaffManage && !keepsStaffManage && (await staffManagers(local, businessId)) <= 1) {
    throw codedError(
      'This is the last account that can manage staff — promote another admin first',
      'LAST_STAFF_MANAGER'
    );
  }

  const now = new Date();
  const write = local.raw.transaction(() => {
    local.db
      .update(users)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive ? 1 : 0 } : {}),
        updatedAt: now,
      })
      .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
      .run();
    if (input.roleId) {
      local.db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.businessId, businessId)))
        .run();
      local.db.insert(userRoles).values({ userId, roleId: input.roleId, businessId }).run();
    }
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'staff.update',
      entity: 'user',
      entityId: userId,
      details: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.roleId ? { role: newRoleName } : {}),
      },
    });
  });
  write();

  return { staff: await loadStaff(local, businessId, userId) };
}

export async function resetStaffPassword(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  userId: string,
  raw: unknown
): Promise<{ ok: true }> {
  requirePermission(new Set(grants), 'staff.manage');
  const input = staffPasswordSchema.parse(raw);

  const [target] = await local.db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
    .limit(1);
  if (!target) throw codedError('Staff member not found', 'STAFF_NOT_FOUND');

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const write = local.raw.transaction(() => {
    local.db
      .update(users)
      .set({ passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.businessId, businessId)))
      .run();
    local.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.businessId, businessId),
          isNull(sessions.revokedAt)
        )
      )
      .run();
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'staff.password_reset',
      entity: 'user',
      entityId: userId,
    });
  });
  write();

  return { ok: true };
}

export async function listRoles(
  local: LocalDb,
  businessId: string,
  grants: string[]
): Promise<{ items: StaffRole[] }> {
  requirePermission(new Set(grants), 'staff.manage');
  const roleRows = await local.db
    .select()
    .from(roles)
    .where(eq(roles.businessId, businessId))
    .orderBy(roles.name);
  const ids = roleRows.map((r) => r.id);
  const permRows =
    ids.length > 0
      ? await local.db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, ids))
      : [];
  const counts = new Map<string, number>();
  for (const row of local.raw
    .prepare(
      `SELECT role_id AS roleId, COUNT(DISTINCT user_id) AS n
         FROM user_roles WHERE business_id = ? GROUP BY role_id`
    )
    .all(businessId) as Array<{ roleId: string; n: number }>) {
    counts.set(row.roleId, row.n);
  }

  return {
    items: roleRows.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem === 1,
      permissions: permRows
        .filter((p) => p.roleId === role.id)
        .map((p) => p.permissionKey)
        .sort(),
      userCount: counts.get(role.id) ?? 0,
    })),
  };
}

export async function updateRolePermissions(
  local: LocalDb,
  businessId: string,
  actorId: string,
  grants: string[],
  roleId: string,
  raw: unknown
): Promise<{ role: StaffRole }> {
  requirePermission(new Set(grants), 'staff.manage');
  const input = rolePermissionsSchema.parse(raw);

  const [role] = await local.db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.businessId, businessId)))
    .limit(1);
  if (!role) throw codedError('Role not found', 'ROLE_NOT_FOUND');

  const allowed = new Set<string>(ALL_PERMISSIONS);
  const wanted = new Set(input.permissions);
  for (const key of wanted) {
    if (!allowed.has(key)) throw codedError(`Unknown permission: ${key}`, 'INVALID_PERMISSION');
  }
  if (role.name === 'Administrator') {
    wanted.add('staff.manage');
    wanted.add('settings.manage');
  }

  const actorRoles = await local.db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, actorId), eq(userRoles.businessId, businessId)));
  if (actorRoles.some((r) => r.roleId === roleId) && !wanted.has('staff.manage')) {
    throw codedError(
      'You cannot remove staff management from your own role',
      'CANNOT_LOCK_SELF_OUT'
    );
  }

  const write = local.raw.transaction(() => {
    local.db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId)).run();
    for (const key of wanted) {
      local.db.insert(rolePermissions).values({ roleId, permissionKey: key }).run();
    }
    writeAuditSync(local, {
      businessId,
      userId: actorId,
      action: 'roles.permissions_update',
      entity: 'role',
      entityId: roleId,
      details: { role: role.name, permissions: [...wanted].sort() },
    });
  });
  write();

  const { items } = await listRoles(local, businessId, grants);
  const updated = items.find((r) => r.id === roleId);
  if (!updated) throw codedError('Role not found', 'ROLE_NOT_FOUND');
  return { role: updated };
}
