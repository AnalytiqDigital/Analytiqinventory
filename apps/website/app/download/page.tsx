import type { Metadata } from 'next';
import {
  downloadUrl,
  isInstallerHosted,
  SUPPORT_WHATSAPP_LABEL,
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
            <span>≈ 95 MB</span>
            <span>Works fully offline</span>
            <span>Version 1.1.0</span>
          </div>

          {hosted ? (
            <a className="btn btn-primary" href={installer}>
              Download AnalytIQ for Windows
            </a>
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
        </div>
      </div>
    </main>
  );
}
