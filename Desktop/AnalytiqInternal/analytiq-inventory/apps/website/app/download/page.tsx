import type { Metadata } from 'next';
import {
  DEFAULT_INSTALLER_URL,
  INSTALLER_SHA256,
  INSTALLER_SIZE_LABEL,
  INSTALLER_VERSION,
  SUPPORT_PHONE_LABEL,
  SUPPORT_WHATSAPP_LABEL,
  callUrl,
  downloadUrl,
  isInstallerHosted,
  whatsappUrl,
} from '../../lib/site';

export const metadata: Metadata = {
  title: 'Download — AnalytIQ Inventory & POS',
  description: 'Download the AnalytIQ Inventory & POS installer for Windows 10 and 11.',
};

export default function DownloadPage() {
  const hosted = isInstallerHosted();
  const installer = downloadUrl();
  const requestLink = whatsappUrl(
    'Hi AnalytIQ, please send me the Windows installer for AnalytIQ Inventory & POS.'
  );

  return (
    <main className="download-page">
      <div className="container">
        <div className="download-card">
          <span className="eyebrow">Windows installer</span>
          <h1>Download AnalytIQ Inventory &amp; POS</h1>
          <p>
            One installer for Windows 10 and 11 (64-bit). The app starts with a 14-day free trial;
            activate a paid licence at any time under Settings → Licence.
          </p>
          <div className="download-meta">
            <span>Windows 10 / 11 · 64-bit</span>
            <span>4 GB RAM</span>
            <span>500 MB free disk</span>
            <span>{INSTALLER_SIZE_LABEL} download</span>
            <span>Version {INSTALLER_VERSION}</span>
            <span>Offline-first</span>
          </div>

          {hosted ? (
            <>
              <a className="btn btn-primary" href={installer}>
                Download AnalytIQ for Windows
              </a>
              <p className="fine-print" style={{ marginTop: 12 }}>
                The download is a ZIP file. Extract it, then run{' '}
                <code>
                  AnalytIQ-Inventory-Setup-{INSTALLER_VERSION}.exe
                </code>{' '}
                inside. On slow or expensive data, message us on WhatsApp and we can send the
                installer or arrange a flash-drive copy.
              </p>
            </>
          ) : (
            <>
              <div className="callout amber">
                <strong>Installer delivery:</strong> request the download on WhatsApp and we will
                send the latest installer and help you set it up.
              </div>
              <a className="btn btn-primary" href={requestLink} target="_blank" rel="noreferrer">
                Request the installer on WhatsApp
              </a>
            </>
          )}

          <div className="success-actions" style={{ justifyContent: 'flex-start' }}>
            <a className="btn btn-outline" href="/docs/installation">
              Installation guide
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

          <div className="callout" style={{ marginTop: 28, marginBottom: 0 }}>
            <strong>Windows protected your PC?</strong> Click <em>More info → Run anyway</em> at the
            SmartScreen prompt. The installer is not yet code-signed, so Windows shows an unknown
            publisher. Full steps are in the{' '}
            <a href="/docs/installation#smartscreen">installation guide</a>. Support:{' '}
            <a href={requestLink} target="_blank" rel="noreferrer">
              {SUPPORT_WHATSAPP_LABEL}
            </a>
            .
          </div>

          {installer === DEFAULT_INSTALLER_URL ? (
            <div className="callout green" style={{ marginTop: 16, marginBottom: 0 }}>
              <strong>Check the file before you run it.</strong> Compare the SHA-256 hash of your
              download with the value below. In PowerShell:
              <br />
              <code>
                Get-FileHash .\AnalytIQ-Inventory-{INSTALLER_VERSION}-Windows.zip -Algorithm SHA256
              </code>
              <br />
              Expected: <code className="hash">{INSTALLER_SHA256}</code>
            </div>
          ) : null}

          <p className="fine-print">
            Your records stay on the shop PC. Support and licence terms are covered by the{' '}
            <a href="/legal/terms">terms of use</a>, <a href="/legal/privacy">privacy notice</a> and{' '}
            <a href="/legal/refund">refund policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
