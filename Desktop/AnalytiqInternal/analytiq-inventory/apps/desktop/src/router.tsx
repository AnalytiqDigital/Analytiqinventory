import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LicenseGate } from './components/LicenseGate';
import { RequireAuth } from './components/RequireAuth';
import { RequireModule } from './components/RequireModule';
import { BatchesPage } from './pages/BatchesPage';
import { CustomersPage } from './pages/CustomersPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { HelpPage } from './pages/HelpPage';
import { InventoryPage } from './pages/InventoryPage';
import { LicensePage } from './pages/LicensePage';
import { LoginPage } from './pages/LoginPage';
import { ModulesPage } from './pages/ModulesPage';
import { PosPage } from './pages/PosPage';
import { PriceListsPage } from './pages/PriceListsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { SetupPage } from './pages/SetupPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffPage } from './pages/StaffPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { TablesPage } from './pages/TablesPage';
import { TaxCategoriesPage } from './pages/TaxCategoriesPage';
import { TransfersPage } from './pages/TransfersPage';

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
              {
                element: <RequireModule module="returns" />,
                children: [{ path: 'returns', element: <ReturnsPage /> }],
              },
              { path: 'products', element: <ProductsPage /> },
              { path: 'products/:id', element: <ProductDetailPage /> },
              {
                element: <RequireModule module="expiry" />,
                children: [{ path: 'batches', element: <BatchesPage /> }],
              },
              { path: 'inventory', element: <InventoryPage /> },
              {
                element: <RequireModule module="transfers" />,
                children: [{ path: 'transfers', element: <TransfersPage /> }],
              },
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
              {
                element: <RequireModule module="priceTiers" />,
                children: [{ path: 'price-lists', element: <PriceListsPage /> }],
              },
              {
                element: <RequireModule module="customers" />,
                children: [{ path: 'debtors', element: <DebtorsPage /> }],
              },
              { path: 'reports', element: <ReportsPage /> },
              { path: 'staff', element: <StaffPage /> },
              { path: 'finance', element: <FinancePage /> },
              { path: 'modules', element: <ModulesPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'help', element: <HelpPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
