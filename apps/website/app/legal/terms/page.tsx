import type { Metadata } from 'next';
import { SUPPORT_WHATSAPP_LABEL, whatsappUrl } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Terms of use — AnalytIQ Inventory & POS',
  description: 'The licence terms that apply when you install and use AnalytIQ Inventory & POS.',
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="legal-updated">Last updated: 20 November 2026</p>
      <p>
        These terms are between <strong>Analytiq Digital</strong>, Abuja, Nigeria (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) and the person or business that installs AnalytIQ Inventory &amp; POS
        (&ldquo;you&rdquo;). Installing or activating the software means you accept them.
      </p>

      <h2>1. Licence granted</h2>
      <p>
        We grant you a non-exclusive, non-transferable licence to install and use the software for
        the internal operations of the business locations shown in your plan. Each installation is
        activated with a licence key issued by us. Keys are tied to the plan and to the computer
        they are activated on unless your plan says otherwise.
      </p>

      <h2>2. Free trial</h2>
      <p>
        Every installation includes a 14-day free trial. The trial starts on first use, not on
        installation. At the end of the trial, business screens stay locked until a licence key is
        activated.
      </p>

      <h2>3. What you may not do</h2>
      <ul>
        <li>
          Copy, resell, sublicense, rent or distribute the software or licence keys, except for
          backup copies of your own installation.
        </li>
        <li>
          Reverse-engineer, decompile or modify the software, or remove licence or copyright
          notices, except where Nigerian law expressly permits it.
        </li>
        <li>
          Share licence keys outside your business, or keep using a key after its licence period
          ends.
        </li>
      </ul>

      <h2>4. Your data and backups</h2>
      <p>
        Your business data — products, sales, customers, suppliers and stock — is stored in a local
        database on your computer. You own it. You are responsible for keeping backups, using the
        backup and restore tools in the app, and for copying backups to a separate drive or cloud
        folder.
      </p>
      <p>
        Optional integrations (WhatsApp alerting, AI message rewriting and branch sync) only send
        data when you enable them and provide the credentials. See the{' '}
        <a href="/legal/privacy">privacy notice</a>.
      </p>

      <h2>5. Updates</h2>
      <p>
        Updates are optional. Installing one replaces the previous version and preserves your data,
        but keep a backup first. We recommend testing new versions during quiet hours.
      </p>

      <h2>6. Support</h2>
      <p>
        Support is available on WhatsApp at {SUPPORT_WHATSAPP_LABEL} during working hours, West
        Africa Time, Monday to Saturday. Support covers installation, activation, restoring backups
        and defects in the software. It does not cover hardware, Windows or network problems outside
        the software.
      </p>

      <h2>7. Warranty</h2>
      <p>
        We warrant that the software substantially performs as described in its documentation. If it
        does not, report it within 30 days of purchase and we will repair or replace it.
      </p>
      <p>
        Except for that warranty, the software is provided &ldquo;as is&rdquo;. To the extent
        Nigerian law allows, we are not liable for indirect or consequential loss, and our total
        liability is limited to the fees you paid for the software in the 12 months before the
        claim. Nothing in these terms excludes liability that cannot be excluded by law.
      </p>

      <h2>8. Term and expiry</h2>
      <p>
        A paid licence runs for the period shown at purchase. If you choose to renew, buy a new key
        and activate it before or after expiry. When a licence expires, selling pauses and the app
        opens on the licence screen. Your records are not deleted.
      </p>
      <p>
        We may end the licence if you materially breach these terms. If that happens, you must stop
        using the software; sections 3, 4 and 7 continue to apply.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of
        the Federal Capital Territory, Abuja have jurisdiction.
      </p>

      <h2>10. Contact</h2>
      <p>
        Analytiq Digital, Abuja, Nigeria. WhatsApp:{' '}
        <a href={whatsappUrl('Hi AnalytIQ, I have a question about the licence terms.')}>
          {SUPPORT_WHATSAPP_LABEL}
        </a>
        .
      </p>
    </>
  );
}
