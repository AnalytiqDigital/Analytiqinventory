import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { whatsappUrl } from '../lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnalytIQ Inventory & POS — offline software for Windows',
  description:
    'Run your whole store without the internet. AnalytIQ Inventory & POS tracks every item, rings every sale and prints every receipt on your Windows PC. Buy a licence online and activate it offline.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const support = whatsappUrl('Hi AnalytIQ, I need help with the inventory app.');
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                A
              </span>
              <span className="brand-name">Analytiq</span>
            </a>
            <nav className="site-nav" aria-label="Main">
              <a className="nav-hide" href="/#features">
                Features
              </a>
              <a className="nav-hide" href="/#hardware">
                Hardware
              </a>
              <a className="nav-hide" href="/#packages">
                Packages
              </a>
              <a className="nav-hide" href="/docs">
                Docs
              </a>
              <a className="nav-hide nav-support" href={support} target="_blank" rel="noreferrer">
                Support
              </a>
              <a className="btn btn-primary btn-small" href="/checkout">
                Get Analytiq
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
                <span className="brand-name">Analytiq</span>
              </a>
              <p>AnalytIQ Inventory &amp; POS — offline software for Windows.</p>
              <p className="footer-muted">
                © {new Date().getFullYear()} Analytiq Digital · Abuja, Nigeria
              </p>
            </div>
            <div className="footer-links">
              <h4>Product</h4>
              <a href="/#features">Features</a>
              <a href="/#hardware">Hardware</a>
              <a href="/#packages">Packages</a>
              <a href="/checkout">Buy a licence</a>
            </div>
            <div className="footer-links">
              <h4>Help</h4>
              <a href="/docs/installation">Installation guide</a>
              <a href="/docs/usage">How to use AnalytIQ</a>
              <a href="/download">Download</a>
              <a href={support} target="_blank" rel="noreferrer">
                WhatsApp support
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
