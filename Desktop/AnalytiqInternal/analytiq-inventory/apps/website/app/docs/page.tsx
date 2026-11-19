import type { Metadata } from 'next';
import { DocsNav } from '../../components/DocsNav';
import { SUPPORT_WHATSAPP_LABEL, whatsappUrl } from '../../lib/site';

export const metadata: Metadata = {
  title: 'Docs — AnalytIQ Inventory & POS',
  description: 'Installation and daily-use guides for AnalytIQ Inventory & POS.',
};

export default function DocsPage() {
  return (
    <main className="docs-page">
      <div className="container">
        <div className="docs-head">
          <span className="eyebrow">Help &amp; docs</span>
          <h1>Everything you need to run AnalytIQ</h1>
          <p>
            Install the app on a Windows PC, set up your shop, and learn the daily screens. These
            guides are written for shop owners and staff, not technicians.
          </p>
        </div>
        <div className="docs-grid">
          <DocsNav current="/docs" />
          <div className="prose">
            <h2>Start here</h2>
            <div className="doc-cards">
              <article className="doc-card">
                <h3>Installation guide</h3>
                <p>
                  Download the installer, get past the Windows warning, install, and activate your
                  licence or 14-day trial.
                </p>
                <a className="text-link" href="/docs/installation">
                  Installation guide →
                </a>
              </article>
              <article className="doc-card">
                <h3>Daily use guide</h3>
                <p>
                  Add products, ring up sales, record stock, take payments, print receipts and read
                  your reports.
                </p>
                <a className="text-link" href="/docs/usage">
                  How to use AnalytIQ →
                </a>
              </article>
            </div>

            <h2>Quick answers</h2>
            <h3>Do I need internet in the shop?</h3>
            <p>
              No. AnalytIQ runs on the shop computer and keeps selling offline. Internet is only
              needed to buy a licence, receive app updates, send WhatsApp alerts or sync branches.
            </p>
            <h3>Where is my data stored?</h3>
            <p>
              In a database file on the shop computer, with automatic backups you can copy to a
              flash drive or cloud folder. Nothing is sent to us unless you switch on WhatsApp
              alerts or branch sync.
            </p>
            <h3>What happens after I pay?</h3>
            <p>
              The confirmation page shows your licence key and the installer download link
              immediately. Save the key, install the app, then paste the key under Settings →
              Licence.
            </p>

            <div className="callout green">
              <strong>Need a hand?</strong> Message us on WhatsApp at{' '}
              <a href={whatsappUrl('Hi AnalytIQ, I need help.')} target="_blank" rel="noreferrer">
                {SUPPORT_WHATSAPP_LABEL}
              </a>
              . We can walk you through installation or a stock take.
            </div>

            <div className="docs-next">
              <a className="btn btn-primary" href="/docs/installation">
                Read the installation guide
              </a>
              <a className="btn btn-outline" href="/download">
                Download AnalytIQ
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
