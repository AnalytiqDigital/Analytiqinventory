import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  COMPANY_SITE,
  COMPANY_SITE_LABEL,
  INSTALLER_VERSION,
  SUPPORT_HOURS,
  SUPPORT_PHONE_LABEL,
  SUPPORT_WHATSAPP_LABEL,
  callUrl,
  whatsappUrl,
} from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnalytIQ Inventory & POS — offline-first software for Windows',
  description:
    'Keep selling when the network is down. AnalytIQ runs on your Windows PC: record sales, track stock and print receipts without internet. 14-day free trial.',
};

const organisation = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Analytiq Digital',
  url: COMPANY_SITE,
  description: 'Makers of AnalytIQ Inventory & POS, offline-first shop software for Windows.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Abuja',
    addressCountry: 'NG',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: '+2348039171767',
    availableLanguage: ['en'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const support = whatsappUrl('Hi AnalytIQ, I need help with the inventory app.');
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisation) }}
        />
        <div className="announce">
          Offline-first Windows software · 14-day free trial · Support on WhatsApp and phone, {SUPPORT_HOURS}
        </div>
        <header className="site-header">
          <div className="container">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                A
              </span>
              <span className="brand-name">AnalytIQ</span>
            </a>
            <nav className="site-nav" aria-label="Main">
              <a className="nav-hide" href="/#features">
                Features
              </a>
              <a className="nav-hide" href="/#offline">
                Offline
              </a>
              <a className="nav-hide" href="/#industries">
                Who it is for
              </a>
              <a className="nav-hide" href="/#tutorial">
                Tutorial
              </a>
              <a className="nav-hide" href="/#packages">
                Pricing
              </a>
              <a className="nav-hide" href="/#cloud-quote">
                Cloud
              </a>
              <a className="nav-hide" href="/docs">
                Docs
              </a>
              <a className="nav-hide nav-support" href={support} target="_blank" rel="noreferrer">
                WhatsApp support
              </a>
              <a className="btn btn-primary btn-small" href="/download">
                Start free trial
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container footer-grid">
            <div className="footer-brand">
              <a className="brand" href="/">
                <span className="brand-mark" aria-hidden="true">
                  A
                </span>
                <span className="brand-name">AnalytIQ</span>
              </a>
              <p>AnalytIQ Inventory &amp; POS — offline-first software for Windows shops.</p>
              <p>
                Made by Analytiq Digital, Abuja, Nigeria. WhatsApp:{' '}
                <a href={support} target="_blank" rel="noreferrer">
                  {SUPPORT_WHATSAPP_LABEL}
                </a>{' '}
                · Call:{' '}
                <a href={callUrl()}>{SUPPORT_PHONE_LABEL}</a>
              </p>
              <p>
                A product of{' '}
                <a href={COMPANY_SITE} target="_blank" rel="noreferrer">
                  {COMPANY_SITE_LABEL}
                </a>
                .
              </p>
              <p className="footer-muted">
                © {new Date().getFullYear()} Analytiq Digital · Version {INSTALLER_VERSION}
              </p>
            </div>
            <div className="footer-links">
              <h4>Product</h4>
              <a href="/#features">Features</a>
              <a href="/#industries">Who it is for</a>
              <a href="/#offline">What works offline</a>
              <a href="/#packages">Pricing</a>
              <a href="/#cloud-quote">Cloud quote</a>
              <a href="/checkout">Buy a licence</a>
            </div>
            <div className="footer-links">
              <h4>Help</h4>
              <a href="/docs/installation">Installation guide</a>
              <a href="/docs/usage">How to use AnalytIQ</a>
              <a href="/download">Download</a>
              <a href="/#faq">FAQ</a>
              <a href="/#support">Support</a>
            </div>
            <div className="footer-links">
              <h4>Legal</h4>
              <a href="/legal/terms">Terms of use</a>
              <a href="/legal/privacy">Privacy notice</a>
              <a href="/legal/refund">Refund policy</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
