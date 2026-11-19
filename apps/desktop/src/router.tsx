import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LicenseGate } from './components/LicenseGate';
import { RequireAuth } from './components/RequireAuth';
import { RequireModule } from './components/RequireModule';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LicensePage } from './pages/LicensePage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PosPage } from './pages/PosPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SetupPage } from './pages/SetupPage';
import { SettingsPage } from './pages/SettingsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { TablesPage } from './pages/TablesPage';
import { TaxCategoriesPage } from './pages/TaxCategoriesPage';

export const router: ReturnType<typeof createHashRouter> = createHashRouter([
  { path: '/setup', element: <SetupPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { path: '/license', element: <LicensePage /> },
      {
        path: '/',
        element: <LicenseGate />,
        children: [
          {
            path: '/',
            element: <AppShell />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: 'pos', element: <PosPage /> },
              {
                element: <RequireModule module="tables" />,
                children: [{ path: 'tables', element: <TablesPage /> }],
              },
              {
                element: <RequireModule module="taxCategories" />,
                children: [{ path: 'tax-categories', element: <TaxCategoriesPage /> }],
              },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/:id', element: <ProductDetailPage /> },
              { path: 'inventory', element: <InventoryPage /> },
              {
                element: <RequireModule module="purchases" />,
                children: [{ path: 'purchases', element: <PurchasesPage /> }],
              },
              {
                element: <RequireModule module="suppliers" />,
                children: [{ path: 'suppliers', element: <SuppliersPage /> }],
              },
              {
                element: <RequireModule module="customers" />,
                children: [{ path: 'customers', element: <CustomersPage /> }],
              },
              { path: 'reports', element: <ReportsPage /> },
              {
                path: 'staff',
                element: (
                  <PlaceholderPage
                    title="Staff and Permissions"
                    batch="Batch 3 — users UI lands below; roles/permissions enforced now"
                  />
                ),
              },
              { path: 'finance', element: <PlaceholderPage title="Finance" batch="later batch" /> },
              { path: 'settings', element: <SettingsPage /> },
              {
                path: 'help',
                element: <PlaceholderPage title="Help and Support" batch="Batch 12" />,
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
