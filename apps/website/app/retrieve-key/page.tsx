import type { Metadata } from 'next';
import RetrieveKeyForm from './retrieve-key-form';

export const metadata: Metadata = {
  title: 'Retrieve your licence key — AnalytIQ',
  description:
    'Lost your AnalytIQ licence key? Enter the order reference from your receipt and the email you paid with.',
};

export default function RetrieveKeyPage() {
  return (
    <main className="checkout">
      <div className="container">
        <div className="checkout-head">
          <h1>Retrieve your licence key</h1>
          <p>
            Enter the order reference from your Paystack receipt and the email you used at checkout.
            We only show a key for a paid order, and both must match.
          </p>
        </div>
        <RetrieveKeyForm />
        <p className="fine-print" style={{ marginTop: 18 }}>
          Do not have the reference? Search your email for &ldquo;AnalytIQ&rdquo; or reply to your
          Paystack receipt and we will resend the key.
        </p>
      </div>
    </main>
  );
}
