import {
 BarChart3,
 CircleHelp,
 LayoutDashboard,
 Package,
 Settings,
 ShoppingCart,
 Truck,
 Users,
 Warehouse,
 Wallet,
 type LucideIcon,
} from 'lucide-react';
import { Armchair, Percent } from 'lucide-react';
import { resolveModules, type OptionalModule } from '@analytiq/validation';

export interface NavItem {
 to: string;
 label: string;
 icon: LucideIcon;
 section: 'Sell' | 'Manage' | 'Setup';
 unfinished?: boolean;
 permission?: string;
 /** When set, the item only shows if the business has this module. */
 module?: OptionalModule;
}

export const NAV_ITEMS: NavItem[] = [
 { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'Sell' },
 { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, section: 'Sell', permission: 'sales.create' },
 { to: '/tables', label: 'Tables', icon: Armchair, section: 'Sell', permission: 'sales.create', module: 'tables' },
 { to: '/products', label: 'Products', icon: Package, section: 'Manage', permission: 'products.manage' },
 { to: '/inventory', label: 'Inventory', icon: Warehouse, section: 'Manage', permission: 'inventory.view' },
 { to: '/purchases', label: 'Purchases', icon: Truck, section: 'Manage', permission: 'purchases.manage', module: 'purchases' },
 { to: '/suppliers', label: 'Suppliers', icon: Truck, section: 'Manage', permission: 'suppliers.manage', module: 'suppliers' },
 { to: '/customers', label: 'Customers', icon: Users, section: 'Manage', permission: 'customers.manage', module: 'customers' },
 { to: '/reports', label: 'Reports', icon: BarChart3, section: 'Manage', permission: 'reports.view' },
 { to: '/finance', label: 'Finance', icon: Wallet, section: 'Manage', unfinished: true, permission: 'reports.view', module: 'finance' },
 { to: '/staff', label: 'Staff & Permissions', icon: Users, section: 'Setup', permission: 'staff.manage' },
 { to: '/settings', label: 'Settings', icon: Settings, section: 'Setup', permission: 'settings.manage' },
 { to: '/tax-categories', label: 'Tax Categories', icon: Percent, section: 'Setup', permission: 'settings.manage', module: 'taxCategories' },
 { to: '/help', label: 'Help & Support', icon: CircleHelp, section: 'Setup' },
];

export const NAV_SECTIONS = ['Sell', 'Manage', 'Setup'] as const;

/**
 * Nav items this session may see: permission-gated, and module-gated by the
 * business type so a pharmacy never shows restaurant tables.
 */
export function visibleNavItems(
 businessType: string | undefined,
 can: (permission: string) => boolean,
): NavItem[] {
 const modules = resolveModules(businessType ?? 'other');
 return NAV_ITEMS.filter((item) => {
 if (item.permission && !can(item.permission)) return false;
 if (item.module && !modules.has(item.module)) return false;
 return true;
 });
}

/** Does the current business have a module switched on? */
export function hasModule(businessType: string | undefined, module: OptionalModule): boolean {
 return resolveModules(businessType ?? 'other').has(module);
}
