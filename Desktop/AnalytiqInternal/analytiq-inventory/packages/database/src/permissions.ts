// Locked permission catalogue. Seeds into `permissions`; roles reference
// these keys. Check with `hasPermission()` / `requirePermission()`.

export const PERMISSIONS = {
  'sales.create': 'Create sales at POS',
  'sales.refund': 'Refund completed sales',
  'sales.view': 'View sales history',
  'products.manage': 'Create, edit, and archive products',
  'inventory.adjust': 'Post stock adjustments and counts',
  'inventory.view': 'View stock levels and movements',
  'purchases.manage': 'Manage purchase orders and receiving',
  'customers.manage': 'Manage customers and credit',
  'suppliers.manage': 'Manage suppliers',
  'reports.view': 'View reports and dashboard metrics',
  'finance.manage': 'Record expenses and view profit statements',
  'staff.manage': 'Manage users, roles, and permissions',
  'settings.manage': 'Manage business and application settings',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS: PermissionKey[] = Object.keys(PERMISSIONS) as PermissionKey[];

export const CASHIER_PERMISSIONS: PermissionKey[] = [
  'sales.create',
  'sales.view',
  'inventory.view',
];

export const MANAGER_PERMISSIONS: PermissionKey[] = [
  ...CASHIER_PERMISSIONS,
  'sales.refund',
  'products.manage',
  'inventory.adjust',
  'purchases.manage',
  'customers.manage',
  'suppliers.manage',
  'reports.view',
  'finance.manage',
];

export const ADMIN_PERMISSIONS: PermissionKey[] = [
  ...MANAGER_PERMISSIONS,
  'staff.manage',
  'settings.manage',
];

export function hasPermission(grants: ReadonlySet<string>, key: PermissionKey): boolean {
  return grants.has(key);
}

export function requirePermission(grants: ReadonlySet<string>, key: PermissionKey): void {
  if (!grants.has(key)) {
    const err = new Error(`Missing required permission: ${key}`);
    (err as NodeJS.ErrnoException).code = 'FORBIDDEN';
    throw err;
  }
}

export function hasAnyPermission(grants: ReadonlySet<string>, keys: PermissionKey[]): boolean {
  return keys.some((k) => grants.has(k));
}

export function requireAnyPermission(grants: ReadonlySet<string>, keys: PermissionKey[]): void {
  if (!hasAnyPermission(grants, keys)) {
    const err = new Error(`Missing required permission (one of: ${keys.join(', ')})`);
    (err as NodeJS.ErrnoException).code = 'FORBIDDEN';
    throw err;
  }
}
