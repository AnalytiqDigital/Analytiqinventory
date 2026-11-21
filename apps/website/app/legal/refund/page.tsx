import type { Metadata } from 'next';
import {
  COMPANY_SITE,
  COMPANY_SITE_LABEL,
  SUPPORT_PHONE_LABEL,
  SUPPORT_WHATSAPP_LABEL,
  callUrl,
  whatsappUrl,
} from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Refund policy — AnalytIQ Inventory & POS',
  description: 'When AnalytIQ Inventory & POS licence purchases can be refunded or replaced.',
};

export default function RefundPage() {
  return (
    <>
      <h1>Refund policy</h1>
      <p className="legal-updated">Last updated: 20 November 2026</p>
      <p>
        We sell software licences, delivered as a licence key that appears on screen after payment.
      </p>

      <h2>1. Try before you buy</h2>
      <p>
        Every installation includes a free 14-day trial with the same features as the paid product.
        Please use the trial to confirm the software works with your scanner, receipt printer and
        daily sales flow before paying.
      </p>

      <h2>2. When we refund</h2>
      <ul>
        <li>
          <strong>Not activated:</strong> cancel within 7 days of purchase for a full refund.
        </li>
        <li>
          <strong>Cannot be activated:</strong> if your key does not activate and we cannot fix it
          within 5 business days, you may choose a replacement key or a full refund.
        </li>
        <li>
          <strong>Defective software:</strong> if a material defect is reported within 30 days of
          purchase and we cannot repair it in a reasonable time, you may choose a replacement or a
          refund, in line with your consumer rights.
        </li>
      </ul>

      <h2>3. When we do not refund</h2>
      <ul>
        <li>After a key has been activated, except under the two clauses above.</li>
        <li>Where a key has been shared or used at more locations than the plan allows.</li>
        <li>
          For hardware, Windows or network problems outside the software. We will still help you
          diagnose them.
        </li>
      </ul>

      <h2>4. How to request a refund</h2>
      <p>
        Message us on WhatsApp at {SUPPORT_WHATSAPP_LABEL} with the order reference from your
        Paystack receipt, your business name and the reason. We reply within 2 business days.
        Approved refunds go back through Paystack to the original payment method, normally within
        5–10 business days depending on your bank.
      </p>

      <h2>5. Chargebacks</h2>
      <p>
        Please contact us first — most issues are resolved the same day. If you raise a chargeback
        without contacting us, the associated licence key is suspended while the bank investigates.
      </p>

      <h2>6. Contact</h2>
      <p>
        Analytiq Digital, Abuja, Nigeria. WhatsApp:{' '}
        <a href={whatsappUrl('Hi AnalytIQ, I would like to request a refund.')}>
          {SUPPORT_WHATSAPP_LABEL}
        </a>{' '}
        · Call: <a href={callUrl()}>{SUPPORT_PHONE_LABEL}</a> ·{' '}
        <a href={COMPANY_SITE} target="_blank" rel="noreferrer">
          {COMPANY_SITE_LABEL}
        </a>
        .
      </p>
    </>
  );
}
