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

export interface NavItem {
 to: string;
 label: string;
 icon: LucideIcon;
 section: 'Sell' | 'Manage' | 'Setup';
 unfinished?: boolean;
 permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
 { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'Sell' },
 { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, section: 'Sell', permission: 'sales.create' },
 { to: '/tables', label: 'Tables', icon: Armchair, section: 'Sell', permission: 'sales.create' },
 { to: '/products', label: 'Products', icon: Package, section: 'Manage', permission: 'products.manage' },
 { to: '/inventory', label: 'Inventory', icon: Warehouse, section: 'Manage', permission: 'inventory.view' },
 { to: '/purchases', label: 'Purchases', icon: Truck, section: 'Manage', permission: 'purchases.manage' },
 { to: '/suppliers', label: 'Suppliers', icon: Truck, section: 'Manage', permission: 'suppliers.manage' },
 { to: '/customers', label: 'Customers', icon: Users, section: 'Manage', permission: 'customers.manage' },
 { to: '/reports', label: 'Reports', icon: BarChart3, section: 'Manage', permission: 'reports.view' },
 { to: '/finance', label: 'Finance', icon: Wallet, section: 'Manage', unfinished: true, permission: 'reports.view' },
 { to: '/staff', label: 'Staff & Permissions', icon: Users, section: 'Setup', permission: 'staff.manage' },
 { to: '/settings', label: 'Settings', icon: Settings, section: 'Setup', permission: 'settings.manage' },
 { to: '/tax-categories', label: 'Tax Categories', icon: Percent, section: 'Setup', permission: 'settings.manage' },
 { to: '/help', label: 'Help & Support', icon: CircleHelp, section: 'Setup' },
];

export const NAV_SECTIONS = ['Sell', 'Manage', 'Setup'] as const;
