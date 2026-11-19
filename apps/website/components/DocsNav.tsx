const items = [
  { href: '/docs', label: 'Overview' },
  { href: '/docs/installation', label: 'Installation' },
  { href: '/docs/usage', label: 'Daily use' },
  { href: '/download', label: 'Download' },
];

export function DocsNav({ current }: { current: string }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      <h2>Help &amp; docs</h2>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={item.href === current ? 'current' : undefined}
          aria-current={item.href === current ? 'page' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
