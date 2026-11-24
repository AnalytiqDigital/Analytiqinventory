import type { Metadata } from 'next';
import AdminDashboard from './admin-dashboard';

export const metadata: Metadata = {
  title: 'Sales dashboard — AnalytIQ Inventory & POS',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="docs-page admin-page">
      <div className="container">
        <span className="eyebrow">Internal</span>
        <h1>Sales dashboard</h1>
        <p className="fine-print">
          Installer clicks, paid orders, discount redemptions and approximate visitor locations.
          Paystack remains the accounting ledger.
        </p>
        <AdminDashboard />
      </div>
    </main>
  );
}
