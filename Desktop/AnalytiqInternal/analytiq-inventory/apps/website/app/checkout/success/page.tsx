import type { Metadata } from 'next';
import { Suspense } from 'react';
import SuccessStatus from './status';

export const metadata: Metadata = {
  title: 'Payment confirmation — AnalytIQ',
  description: 'Collect your AnalytIQ licence key after payment.',
};

export default function CheckoutSuccessPage() {
  return (
    <main className="success">
      <div className="container">
        <Suspense
          fallback={
            <div className="success-card">
              <div className="spinner" aria-hidden="true" />
              <h1>Confirming your payment…</h1>
            </div>
          }
        >
          <SuccessStatus />
        </Suspense>
      </div>
    </main>
  );
}
