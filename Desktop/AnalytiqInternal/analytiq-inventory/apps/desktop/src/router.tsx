import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { RequireModule } from './components/RequireModule';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PosPage } from './pages/PosPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { SetupPage } from './pages/SetupPage';
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
          { element: <RequireModule module="tables" />, children: [{ path: 'tables', element: <TablesPage /> }] },
          { element: <RequireModule module="taxCategories" />, children: [{ path: 'tax-categories', element: <TaxCategoriesPage /> }] },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/:id', element: <ProductDetailPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'purchases', element: <PlaceholderPage title="Purchases" batch="Batch 6" /> },
          { path: 'suppliers', element: <PlaceholderPage title="Suppliers" batch="Batch 6" /> },
          { path: 'customers', element: <PlaceholderPage title="Customers" batch="Batch 6" /> },
          { path: 'reports', element: <PlaceholderPage title="Reports" batch="Batch 9" /> },
          { path: 'staff', element: <PlaceholderPage title="Staff and Permissions" batch="Batch 3 — users UI lands below; roles/permissions enforced now" /> },
          { path: 'finance', element: <PlaceholderPage title="Finance" batch="later batch" /> },
          { path: 'settings', element: <PlaceholderPage title="Settings" batch="Batch 3 — business record created at setup; editing UI arrives later" /> },
          { path: 'help', element: <PlaceholderPage title="Help and Support" batch="Batch 12" /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
