import type { Metadata } from 'next';
import { DocsNav } from '../../../components/DocsNav';
import {
  INSTALLER_VERSION,
  SUPPORT_PHONE_LABEL,
  SUPPORT_WHATSAPP_LABEL,
  callUrl,
  trackedDownloadUrl,
  whatsappUrl,
} from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Installation guide — AnalytIQ',
  description: 'How to install AnalytIQ Inventory & POS on a Windows PC and activate your licence.',
};

export default function InstallationPage() {
  return (
    <main className="docs-page">
      <div className="container">
        <div className="docs-head">
          <span className="eyebrow">Installation</span>
          <h1>Install AnalytIQ on your shop computer</h1>
          <p>
            You need one Windows 10 or 11 computer (64-bit) with at least 4 GB RAM and 500 MB free
            disk space. The installer includes everything else — the app works offline from the
            first launch.
          </p>
        </div>
        <div className="docs-grid">
          <DocsNav current="/docs/installation" />
          <div className="prose">
            <div className="callout">
              <strong>Before you start:</strong> if you already bought a licence, keep the key from
              your payment confirmation page nearby. You can also start a 14-day free trial without
              a key.
            </div>

            <h2 id="download">1. Download the installer</h2>
            <p>
              Click the button below to download{' '}
              <code>AnalytIQ-Inventory-{INSTALLER_VERSION}-Windows.zip</code> (about 95 MB), then
              extract it. Inside is <code>AnalytIQ-Inventory-Setup-{INSTALLER_VERSION}.exe</code> —
              the file you run. The download page shows the SHA-256 checksum so you can confirm the
              file is intact.
            </p>
            <p>
              <a className="btn btn-primary" href={trackedDownloadUrl({ source: 'docs' })}>
                Download for Windows
              </a>
            </p>
            <p>
              On slow or expensive data, or if you need the installer on a flash drive, message
              support on WhatsApp ({SUPPORT_WHATSAPP_LABEL}) or call {SUPPORT_PHONE_LABEL}.
            </p>

            <h2 id="smartscreen">2. Allow the installer to run</h2>
            <p>
              Windows may show <strong>&ldquo;Windows protected your PC&rdquo;</strong> because the
              installer is not yet signed with a paid code-signing certificate. This is normal for a
              new vendor build.
            </p>
            <ol>
              <li>
                On the blue SmartScreen window, click <strong>More info</strong>.
              </li>
              <li>
                Click <strong>Run anyway</strong>.
              </li>
              <li>
                If Windows User Account Control asks for permission, the publisher shows as{' '}
                <em>Unknown publisher</em>. Click <strong>Yes</strong>.
              </li>
            </ol>
            <div className="callout amber">
              Only run the installer you downloaded from this site or received directly from
              AnalytIQ support on WhatsApp ({SUPPORT_WHATSAPP_LABEL}).
            </div>

            <h2 id="install">3. Install</h2>
            <ol>
              <li>Choose the install location (the default is fine) and click Install.</li>
              <li>Wait for the progress bar to finish, then click Finish.</li>
              <li>
                Open <strong>AnalytIQ Inventory &amp; POS</strong> from the Start menu.
              </li>
            </ol>

            <h2 id="setup">4. Set up your business</h2>
            <p>The first launch opens a three-step setup wizard:</p>
            <ol>
              <li>
                <strong>Business details</strong> — shop name, phone and address. These appear on
                receipts.
              </li>
              <li>
                <strong>Your account</strong> — your name, email and password. This is the
                Administrator account.
              </li>
              <li>
                <strong>Location</strong> — the shop or branch name and its currency/tax settings.
              </li>
            </ol>
            <p>You can change all of this later in Settings.</p>

            <h2 id="licence">5. Activate your licence or trial</h2>
            <p>The app starts with a 14-day free trial. To activate a paid licence:</p>
            <ol>
              <li>
                Open <strong>Settings → Licence</strong>.
              </li>
              <li>Paste the licence key from your payment confirmation page.</li>
              <li>
                Choose <strong>Activate</strong>. Keep the computer online for this one step — the
                key locks to this computer, then the app works fully offline.
              </li>
            </ol>
            <p>
              Your key is locked to this computer. To move to another PC later, choose{' '}
              <strong>Deactivate</strong> on the old machine first, then activate the same key on
              the new one. If the old computer will not start, message support with your licence key
              and we will release it from our side.
            </p>

            <h2 id="hardware">6. Connect your printer and scanner</h2>
            <h3>Receipt printer</h3>
            <p>
              Install the printer driver that came with your Xprinter or other thermal printer, then
              open <strong>Settings → Printing</strong> and pick the printer. Choose 58 mm or 80 mm
              paper, then use <strong>Test print</strong>.
            </p>
            <h3>Barcode scanner</h3>
            <p>
              Plug in a USB keyboard-wedge scanner. It works immediately on the Sell screen — scan a
              barcode to add the product, or scan into the search box.
            </p>

            <h2 id="lan">7. Add more tills (optional)</h2>
            <p>
              On the main computer, open <strong>Settings → LAN</strong> and start the server. On
              each other till, choose <em>Connect to a shop server</em> at login and enter the main
              computer&apos;s address shown in Settings. All tills then share one stock and sales
              ledger.
            </p>

            <h2 id="backups">8. Turn on backups</h2>
            <p>
              AnalytIQ takes an automatic daily backup. Open <strong>Settings → Backups</strong> to
              see them, create one immediately, or copy the latest file to a flash drive or cloud
              folder. Do this before any major change.
            </p>

            <div className="callout green">
              <strong>Stuck on a step?</strong>{' '}
              <a
                href={whatsappUrl('Hi AnalytIQ, I am installing the app and need help.')}
                target="_blank"
                rel="noreferrer"
              >
                Message support on WhatsApp
              </a>{' '}
              — send a photo of the screen and we will walk you through it.
            </div>

            <div className="docs-next">
              <a className="btn btn-primary" href="/docs/usage">
                Next: how to use AnalytIQ
              </a>
              <a
                className="btn btn-outline"
                href={whatsappUrl('Hi AnalytIQ, I need help installing the app.')}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp support
              </a>
              <a className="btn btn-outline" href={callUrl()}>
                Call {SUPPORT_PHONE_LABEL}
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
