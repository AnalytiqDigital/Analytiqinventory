import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="docs-page">
      <div className="container">
        <div className="prose legal-prose">{children}</div>
      </div>
    </main>
  );
}
