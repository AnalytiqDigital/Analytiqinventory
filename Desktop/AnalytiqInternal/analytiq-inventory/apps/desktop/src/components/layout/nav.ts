import {
  BarChart3,
  BellRing,
  Boxes,
  CalendarClock,
  CircleHelp,
  LayoutDashboard,
  Package,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Warehouse,
  Wallet,
  Armchair,
  ArrowLeftRight,
  Percent,
  type LucideIcon,
} from 'lucide-react';
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
  { to: '/returns', label: 'Returns', icon: RotateCcw, section: 'Sell', permission: 'sales.create', module: 'returns' },
  { to: '/products', label: 'Products', icon: Package, section: 'Manage', permission: 'products.manage' },
  { to: '/batches', label: 'Batches & Expiry', icon: CalendarClock, section: 'Manage', permission: 'inventory.view', module: 'expiry' },
  { to: '/inventory', label: 'Inventory', icon: Warehouse, section: 'Manage', permission: 'inventory.view' },
  { to: '/transfers', label: 'Stock Transfers', icon: ArrowLeftRight, section: 'Manage', permission: 'inventory.view', module: 'transfers' },
  { to: '/purchases', label: 'Purchases', icon: Truck, section: 'Manage', permission: 'purchases.manage', module: 'purchases' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, section: 'Manage', permission: 'suppliers.manage', module: 'suppliers' },
  { to: '/customers', label: 'Customers', icon: Users, section: 'Manage', permission: 'customers.manage', module: 'customers' },
  { to: '/price-lists', label: 'Price Lists', icon: Tags, section: 'Manage', permission: 'customers.manage', module: 'priceTiers' },
  { to: '/debtors', label: 'Debtors', icon: BellRing, section: 'Manage', permission: 'customers.manage', module: 'customers' },
  { to: '/reports', label: 'Reports', icon: BarChart3, section: 'Manage', permission: 'reports.view' },
  { to: '/finance', label: 'Finance', icon: Wallet, section: 'Manage', permission: 'reports.view', module: 'finance' },
  { to: '/staff', label: 'Staff & Permissions', icon: Users, section: 'Setup', permission: 'staff.manage' },
  { to: '/modules', label: 'Install Modules', icon: Boxes, section: 'Setup', permission: 'settings.manage' },
  { to: '/settings', label: 'Settings', icon: Settings, section: 'Setup', permission: 'settings.manage' },
  { to: '/tax-categories', label: 'Tax Categories', icon: Percent, section: 'Setup', permission: 'settings.manage', module: 'taxCategories' },
  { to: '/help', label: 'Help & Support', icon: CircleHelp, section: 'Setup' },
];

export const NAV_SECTIONS = ['Sell', 'Manage', 'Setup'] as const;

/**
 * Modules this session may use: the saved install choice from the server when
 * present, otherwise the defaults for the business type.
 */
export function moduleSet(businessType: string | undefined, modules?: string[]): Set<string> {
  if (modules && modules.length > 0) return new Set(modules);
  return resolveModules(businessType ?? 'other');
}

/**
 * Nav items this session may see: permission-gated, and module-gated by the
 * installed modules so a pharmacy never shows restaurant tables.
 */
export function visibleNavItems(
  businessType: string | undefined,
  can: (permission: string) => boolean,
  modules?: string[],
): NavItem[] {
  const enabled = moduleSet(businessType, modules);
  return NAV_ITEMS.filter((item) => {
    if (item.permission && !can(item.permission)) return false;
    if (item.module && !enabled.has(item.module)) return false;
    return true;
  });
}

/** Does the current business have a module switched on? */
export function hasModule(
  businessType: string | undefined,
  module: OptionalModule,
  modules?: string[],
): boolean {
  return moduleSet(businessType, modules).has(module);
}
