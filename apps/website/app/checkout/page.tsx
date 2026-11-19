import type { Metadata } from 'next';
import { Suspense } from 'react';
import CheckoutForm from './checkout-form';

export const metadata: Metadata = {
  title: 'Buy a licence — AnalytIQ',
  description: 'Pay securely with Paystack and receive your AnalytIQ licence key instantly.',
};

export default function CheckoutPage() {
  return (
    <main className="checkout">
      <div className="container">
        <div className="checkout-head">
          <h1>Buy your AnalytIQ licence</h1>
          <p>
            Pay securely with Paystack. The moment payment confirms, your licence key and the
            installer download appear on screen — install the app, then paste the key under Settings
            → Licence.
          </p>
        </div>
        <Suspense fallback={<div className="card">Loading checkout…</div>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </main>
  );
}
