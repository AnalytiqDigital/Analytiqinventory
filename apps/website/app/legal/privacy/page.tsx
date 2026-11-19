import type { Metadata } from 'next';
import { SUPPORT_WHATSAPP_LABEL, whatsappUrl } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Privacy notice — AnalytIQ Inventory & POS',
  description:
    'How Analytiq Digital handles personal data in the desktop app, the website and licence issuance.',
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p className="legal-updated">Last updated: 20 November 2026</p>
      <p>
        This notice explains how <strong>Analytiq Digital</strong>, Abuja, Nigeria, handles personal
        data in connection with AnalytIQ Inventory &amp; POS, this website and licence issuance,
        under the Nigeria Data Protection Act 2023 (NDPA). The Nigeria Data Protection Commission
        (NDPC) is the supervisory authority.
      </p>

      <h2>1. Data inside the desktop app</h2>
      <p>
        The app stores everything in a database file on your computer: products, sales, customers,
        suppliers, users and settings. We have no remote access to it and receive no copy of it. You
        are the controller of that data: you decide who uses the app, what customer details you
        record and how long you keep them.
      </p>
      <p>
        Licence activation is offline. The app checks the key&rsquo;s signature using a public key
        built into the software and does not contact us to activate. Only a random installation ID
        and the activation date are stored locally.
      </p>

      <h2>2. Data we handle when you buy</h2>
      <p>
        Checkout collects your name, business name, email, phone number and chosen plan. Payment is
        processed by <strong>Paystack</strong>; card details go directly to Paystack and never reach
        us. Paystack&rsquo;s own privacy policy applies to the payment.
      </p>
      <p>
        We keep the order reference, your contact details and the issued licence key so we can
        deliver the key, provide support and meet Nigerian tax and accounting obligations. We keep
        them only as long as needed for those purposes, then delete or anonymise them.
      </p>

      <h2>3. Optional integrations you enable</h2>
      <ul>
        <li>
          <strong>WhatsApp alerts</strong> send message text to Meta&rsquo;s WhatsApp Cloud API
          using credentials you supply.
        </li>
        <li>
          <strong>AI message rewriting</strong> sends message text to the OpenAI-compatible endpoint
          you configure.
        </li>
        <li>
          <strong>Branch sync</strong> sends the business records you choose through the relay you
          configure.
        </li>
      </ul>
      <p>
        Credentials for these integrations are stored only in your local database. The features stay
        off until you enable them. If your messages contain customer personal data, make sure you
        have a lawful basis before sending them.
      </p>

      <h2>4. Your rights</h2>
      <p>
        Under the NDPA you may request access to, correction of, or deletion of personal data we
        hold about you, object to processing, or request a copy in a portable format. Message us on
        WhatsApp at {SUPPORT_WHATSAPP_LABEL} and we will respond within the timeframe the NDPA sets.
        You may also complain to the Nigeria Data Protection Commission.
      </p>

      <h2>5. Security</h2>
      <p>
        We keep the licence signing key offline and off customer machines, use HTTPS on this site,
        and limit internal access to order records. No system is perfectly secure; report suspected
        breaches to us on WhatsApp promptly.
      </p>

      <h2>6. Contact</h2>
      <p>
        Analytiq Digital, Abuja, Nigeria. WhatsApp:{' '}
        <a href={whatsappUrl('Hi AnalytIQ, I have a privacy question.')}>
          {SUPPORT_WHATSAPP_LABEL}
        </a>
        .
      </p>
    </>
  );
}
