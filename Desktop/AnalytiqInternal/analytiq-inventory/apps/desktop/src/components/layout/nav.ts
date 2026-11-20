import {
  ArrowLeftRight,
  Barcode,
  BarChart3,
  BellRing,
  Boxes,
  Calculator,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  Settings,
  Shapes,
  ShoppingCart,
  Tags,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  Armchair,
  type LucideIcon,
} from 'lucide-react';
import { resolveModules, type OptionalModule } from '@analytiq/validation';

export type NavGroup =
  | 'Main'
  | 'Sell'
  | 'Products'
  | 'Inventory'
  | 'Purchases'
  | 'Contacts'
  | 'Reports'
  | 'Finance'
  | 'Setup';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  unfinished?: boolean;
  permission?: string;
  /** When set, the item only shows if the business has this module. */
  module?: OptionalModule;
}

/** Menu order, mirroring the grouped sidebar of the reference ERP. */
export const NAV_GROUPS: NavGroup[] = [
  'Main',
  'Sell',
  'Products',
  'Inventory',
  'Purchases',
  'Contacts',
  'Reports',
  'Finance',
  'Setup',
];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'Main' },
  {
    to: '/pos',
    label: 'Point of Sale',
    icon: ShoppingCart,
    group: 'Sell',
    permission: 'sales.create',
  },
  {
    to: '/tables',
    label: 'Tables',
    icon: Armchair,
    group: 'Sell',
    permission: 'sales.create',
    module: 'tables',
  },
  {
    to: '/returns',
    label: 'Returns',
    icon: RotateCcw,
    group: 'Sell',
    permission: 'sales.create',
    module: 'returns',
  },
  {
    to: '/products',
    label: 'List Products',
    icon: Package,
    group: 'Products',
    permission: 'products.manage',
  },
  {
    to: '/labels',
    label: 'Print Labels',
    icon: Barcode,
    group: 'Products',
    permission: 'products.manage',
  },
  {
    to: '/masters',
    label: 'Units, Brands & Groups',
    icon: Shapes,
    group: 'Products',
    permission: 'products.manage',
  },
  {
    to: '/price-lists',
    label: 'Selling Price Groups',
    icon: Tags,
    group: 'Products',
    permission: 'customers.manage',
    module: 'priceTiers',
  },
  {
    to: '/batches',
    label: 'Batches & Expiry',
    icon: CalendarClock,
    group: 'Products',
    permission: 'inventory.view',
    module: 'expiry',
  },
  {
    to: '/inventory',
    label: 'Stock Levels',
    icon: Warehouse,
    group: 'Inventory',
    permission: 'inventory.view',
  },
  {
    to: '/stock-adjustments',
    label: 'Stock Adjustments',
    icon: ClipboardList,
    group: 'Inventory',
    permission: 'inventory.adjust',
  },
  {
    to: '/transfers',
    label: 'Stock Transfers',
    icon: ArrowLeftRight,
    group: 'Inventory',
    permission: 'inventory.view',
    module: 'transfers',
  },
  {
    to: '/purchases',
    label: 'List Purchases',
    icon: Truck,
    group: 'Purchases',
    permission: 'purchases.manage',
    module: 'purchases',
  },
  {
    to: '/purchase-returns',
    label: 'Purchase Returns',
    icon: Undo2,
    group: 'Purchases',
    permission: 'purchases.manage',
    module: 'purchases',
  },
  {
    to: '/customers',
    label: 'Customers',
    icon: Users,
    group: 'Contacts',
    permission: 'customers.manage',
    module: 'customers',
  },
  {
    to: '/suppliers',
    label: 'Suppliers',
    icon: Truck,
    group: 'Contacts',
    permission: 'suppliers.manage',
    module: 'suppliers',
  },
  {
    to: '/debtors',
    label: 'Debtors',
    icon: BellRing,
    group: 'Contacts',
    permission: 'customers.manage',
    module: 'customers',
  },
  {
    to: '/reports',
    label: 'All Reports',
    icon: BarChart3,
    group: 'Reports',
    permission: 'reports.view',
  },
  {
    to: '/accounting',
    label: 'Profit & Loss',
    icon: Calculator,
    group: 'Reports',
    permission: 'reports.view',
  },
  {
    to: '/finance',
    label: 'Finance Overview',
    icon: Wallet,
    group: 'Finance',
    permission: 'reports.view',
    module: 'finance',
  },
  {
    to: '/expenses',
    label: 'Expenses',
    icon: Receipt,
    group: 'Finance',
    permission: 'finance.manage',
    module: 'expenses',
  },
  {
    to: '/staff',
    label: 'Users & Roles',
    icon: Users,
    group: 'Setup',
    permission: 'staff.manage',
  },
  {
    to: '/tax-categories',
    label: 'Tax Categories',
    icon: Percent,
    group: 'Setup',
    permission: 'settings.manage',
    module: 'taxCategories',
  },
  {
    to: '/modules',
    label: 'Install Modules',
    icon: Boxes,
    group: 'Setup',
    permission: 'settings.manage',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    group: 'Setup',
    permission: 'settings.manage',
  },
  { to: '/help', label: 'Help & Support', icon: CircleHelp, group: 'Setup' },
];

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
  modules?: string[]
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
  modules?: string[]
): boolean {
  return moduleSet(businessType, modules).has(module);
}
