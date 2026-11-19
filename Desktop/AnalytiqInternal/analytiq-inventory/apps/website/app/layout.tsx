import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnalytIQ Inventory & POS',
  description:
    'Inventory, point of sale, customer credit and WhatsApp alerts for Nigerian shops. Buy a licence online and activate it in minutes.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <a className="brand" href="/">
              <span className="brand-mark">AQ</span>
              AnalytIQ
            </a>
            <nav className="site-nav" aria-label="Main">
              <a className="nav-hide" href="/#features">
                Features
              </a>
              <a className="nav-hide" href="/#pricing">
                Pricing
              </a>
              <a className="nav-hide" href="/#faq">
                FAQ
              </a>
              <a className="btn btn-primary btn-small" href="/checkout">
                Buy a licence
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container">
            <span>© {new Date().getFullYear()} AnalytIQ. Lagos, Nigeria.</span>
            <span>Licences activate offline — no internet needed in your shop.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
