import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { RequireModule } from './components/RequireModule';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PosPage } from './pages/PosPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SetupPage } from './pages/SetupPage';
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
          { path: 'reports', element: <PlaceholderPage title="Reports" batch="Batch 9" /> },
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
          {
            path: 'settings',
            element: (
              <PlaceholderPage
                title="Settings"
                batch="Batch 3 — business record created at setup; editing UI arrives later"
              />
            ),
          },
          { path: 'help', element: <PlaceholderPage title="Help and Support" batch="Batch 12" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
