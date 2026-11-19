import Image from 'next/image';
import { licensePlans } from '@analytiq/validation';
import { DemoRequest } from '../components/DemoRequest';
import { formatNaira } from '../lib/format';
import { downloadUrl, isInstallerHosted, whatsappUrl } from '../lib/site';

const pillars = [
  {
    title: 'Works with no internet',
    body: 'Every sale, stock count and report runs locally on the shop computer.',
    icon: 'wifi',
  },
  {
    title: 'Windows desktop app',
    body: 'Installs on Windows 10 and 11 PCs and laptops — no browser tab to lose.',
    icon: 'windows',
  },
  {
    title: 'Your data, your control',
    body: 'Local database with one-click backups you can copy to a drive or cloud folder.',
    icon: 'shield',
  },
  {
    title: 'Fast at the counter',
    body: 'No page loads, no waiting on a signal. Ring a sale in seconds.',
    icon: 'bolt',
  },
] as const;

const weekBars = [38, 62, 48, 74, 56, 88, 70];
const reportBars = [30, 52, 44, 68, 40, 82, 58];

function PillarIcon({ name }: { name: (typeof pillars)[number]['icon'] }): JSX.Element {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'wifi') {
    return (
      <svg {...common}>
        <path d="M3 8.5a15 15 0 0 1 18 0" />
        <path d="M6 12a10.5 10.5 0 0 1 12 0" />
        <path d="M9 15.5a6 6 0 0 1 6 0" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
        <path d="M2 2l20 20" />
      </svg>
    );
  }
  if (name === 'windows') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

function HardwareIcon({
  name,
}: {
  name: 'terminal' | 'scanner' | 'printer' | 'drawer';
}): JSX.Element {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'terminal') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="24" height="16" rx="2" />
        <path d="M16 21v5M10 28h12" />
        <path d="M9 11h6M9 15h10" />
      </svg>
    );
  }
  if (name === 'scanner') {
    return (
      <svg {...common}>
        <path d="M5 11V7a2 2 0 0 1 2-2h4M21 5h4a2 2 0 0 1 2 2v4" />
        <path d="M27 21v4a2 2 0 0 1-2 2h-4M11 27H7a2 2 0 0 1-2-2v-4" />
        <path d="M12 12v8M16 12v8M20 12v8" />
      </svg>
    );
  }
  if (name === 'printer') {
    return (
      <svg {...common}>
        <path d="M9 9V4h14v5" />
        <rect x="5" y="9" width="22" height="11" rx="2" />
        <path d="M9 20h14v7H9z" />
        <path d="M9 24h14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="5" y="12" width="22" height="14" rx="2" />
      <path d="M5 18h22M12 12V8h8v4" />
      <path d="M9 23h4" />
    </svg>
  );
}

function Barcode(): JSX.Element {
  return (
    <div className="barcode" aria-hidden="true">
      <span />
    </div>
  );
}

export default function HomePage() {
  const installer = downloadUrl();
  const hosted = isInstallerHosted();
  const support = whatsappUrl('Hi AnalytIQ, I would like to ask about the inventory app.');

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">100% offline · built for Windows</span>
            <h1>
              Run your whole store <span>without the internet.</span>
            </h1>
            <p className="lede">
              AnalytIQ Inventory &amp; POS is desktop software that tracks every item, rings every
              sale and prints every receipt, entirely on your Windows PC. No connection needed. No
              monthly cloud bill. Your data stays in your shop.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#packages">
                See packages
              </a>
              <a className="btn btn-outline" href={installer}>
                {hosted ? 'Download for Windows' : 'Download free trial'}
              </a>
            </div>
            <p className="hero-note">
              14-day free trial · Windows 10/11 · Licence keys activate offline ·{' '}
              <a href="#dashboard">see the dashboard ↓</a>
            </p>
          </div>

          <div className="mock" aria-label="AnalytIQ dashboard preview">
            <div className="mock-head">
              <span className="mock-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="mock-title">Analytiq POS</span>
              <span className="mock-live">
                <i aria-hidden="true" /> Offline mode
              </span>
            </div>
            <div className="mock-stats">
              <div>
                <label>Today&apos;s sales</label>
                <strong>₦186,450</strong>
                <span>47 receipts</span>
              </div>
              <div>
                <label>Items in stock</label>
                <strong>1,284</strong>
                <span>across 312 products</span>
              </div>
              <div>
                <label>Low stock</label>
                <strong className="warn">07</strong>
                <span>needs a reorder</span>
              </div>
            </div>
            <div className="mock-chart">
              <div className="mock-chart-head">
                <span>Last 7 days</span>
                <span>Nov 12 – Nov 18</span>
              </div>
              <div className="bars">
                {weekBars.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <div className="mock-receipt">
              <span className="receipt-check" aria-hidden="true">
                ✓
              </span>
              Receipt #0042 printed
              <span className="paid-tag">Paid</span>
            </div>
            <p className="mock-note">Sample data from a live shop dashboard.</p>
          </div>
        </div>
      </section>

      <section className="pillars" id="features">
        <div className="container pillar-grid">
          {pillars.map((pillar) => (
            <article className="pillar" key={pillar.title}>
              <span className="pillar-icon">
                <PillarIcon name={pillar.icon} />
              </span>
              <div>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="illustration-card">
            <Image
              src="/shop-owner.png"
              alt="Shop owner using AnalytIQ at a boutique counter"
              width={1536}
              height={1024}
              priority={false}
            />
            <span className="float-chip chip-top">Stock updated</span>
            <span className="float-chip chip-bottom">Reorder placed</span>
          </div>
          <div className="split-copy">
            <span className="eyebrow">Made for busy counters</span>
            <h2>Simple enough to learn in an afternoon</h2>
            <p>
              From the provision store to the pharmacy counter, AnalytIQ gives you and your staff
              one clear screen for stock, sales and receipts. No technical background needed, and no
              internet required.
            </p>
            <ul className="check-list">
              <li>Add products and prices in minutes</li>
              <li>Ring up customers without leaving the screen</li>
              <li>Close the day knowing your stock and cash agree</li>
            </ul>
            <a className="text-link" href="/docs/usage">
              See how a day looks in AnalytIQ →
            </a>
          </div>
        </div>
      </section>

      <section className="section section-dashboard" id="dashboard">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">The dashboard</span>
            <h2>Everything you manage, on one glass screen</h2>
            <p>Each panel below is a real part of the AnalytIQ dashboard. Sample data shown.</p>
          </div>

          <div className="panel-grid">
            <article className="panel">
              <h3>Live stock levels</h3>
              <p>See what is on the shelf right now. Stock drops the moment a sale is made.</p>
              <div className="stock-rows">
                <div>
                  <span>Peak Milk 400g</span>
                  <div className="track">
                    <i style={{ width: '86%' }} />
                  </div>
                  <em>86%</em>
                </div>
                <div>
                  <span>Golden Penny 1kg</span>
                  <div className="track">
                    <i style={{ width: '54%' }} />
                  </div>
                  <em>54%</em>
                </div>
                <div>
                  <span>Coca-Cola 50cl</span>
                  <div className="track low">
                    <i style={{ width: '31%' }} />
                  </div>
                  <em>31%</em>
                </div>
              </div>
            </article>

            <article className="panel">
              <h3>Lightning checkout</h3>
              <p>Search, scan or tap a product. Split cash, transfer, POS or credit.</p>
              <div className="mini-cart">
                <div>
                  <span>Peak Milk × 2</span>
                  <strong>₦3,400</strong>
                </div>
                <div>
                  <span>Semovita 1kg</span>
                  <strong>₦1,250</strong>
                </div>
                <div className="mini-cart-total">
                  <span>Total</span>
                  <strong>₦4,650</strong>
                </div>
                <span className="mini-pay">Pay &amp; print</span>
              </div>
            </article>

            <article className="panel">
              <h3>Low-stock alerts</h3>
              <p>Know what to reorder before a shelf goes empty.</p>
              <ul className="alert-list">
                <li>
                  <span>Peak Milk 400g</span>
                  <b className="tag-alert">Reorder</b>
                </li>
                <li>
                  <span>Golden Penny 1kg</span>
                  <b className="tag-alert">Reorder</b>
                </li>
                <li>
                  <span>Sunlight 500ml</span>
                  <b className="tag-low">Low</b>
                </li>
                <li>
                  <span>Semovita 1kg</span>
                  <b className="tag-ok">Healthy</b>
                </li>
              </ul>
            </article>

            <article className="panel">
              <h3>Sales reports</h3>
              <p>Daily, weekly and monthly totals, best sellers and profit at a glance.</p>
              <div className="mini-report">
                <div className="bars small">
                  {reportBars.map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="mini-report-foot">
                  <span>This week</span>
                  <strong>₦942,300</strong>
                </div>
              </div>
            </article>

            <article className="panel">
              <h3>Barcodes &amp; labels</h3>
              <p>Scan existing codes or generate and print your own labels.</p>
              <Barcode />
              <div className="label-line">
                <span>PEAK-MLK-400</span>
                <span>₦1,700</span>
              </div>
            </article>

            <article className="panel">
              <h3>Staff roles &amp; audit trail</h3>
              <p>Cashiers sell, managers adjust stock, owners see everything.</p>
              <ul className="role-list">
                <li>
                  <span className="role-dot owner" /> Owner <b>Full access</b>
                </li>
                <li>
                  <span className="role-dot manager" /> Manager <b>Stock &amp; reports</b>
                </li>
                <li>
                  <span className="role-dot cashier" /> Cashier <b>Sales only</b>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="hardware">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Hardware ready</span>
            <h2>Plug in your counter hardware and sell</h2>
            <p>
              AnalytIQ is designed to work with standard retail peripherals, so you can build the
              counter that fits your shop.
            </p>
          </div>
          <div className="hardware-grid">
            <article className="hardware">
              <span className="hardware-icon">
                <HardwareIcon name="terminal" />
              </span>
              <h3>POS terminal</h3>
              <p>Any Windows PC, all-in-one or laptop.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <HardwareIcon name="scanner" />
              </span>
              <h3>Barcode scanner</h3>
              <p>Scan at the counter or during stock takes.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <HardwareIcon name="printer" />
              </span>
              <h3>Receipt printer</h3>
              <p>Xprinter 58 mm and 80 mm thermal printers.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <HardwareIcon name="drawer" />
              </span>
              <h3>Cash drawer</h3>
              <p>Pops open automatically on every cash sale.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-packages" id="packages">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Packages</span>
            <h2>Choose the Analytiq that fits your business</h2>
            <p>One payment for 12 months. Fully offline on every plan.</p>
          </div>
          <div className="package-grid">
            {licensePlans.map((plan) => {
              const featured = plan.id === 'standard';
              return (
                <article className={`package${featured ? ' featured' : ''}`} key={plan.id}>
                  {featured ? <span className="package-badge">Most popular</span> : null}
                  <h3>{plan.name}</h3>
                  <p className="package-tagline">{plan.tagline}</p>
                  <div className="package-price">
                    {formatNaira(plan.priceKobo)}
                    <span>/year</span>
                  </div>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <a
                    className={`btn ${featured ? 'btn-primary' : 'btn-outline'} btn-block`}
                    href={`/checkout?plan=${plan.id}`}
                  >
                    Choose {plan.name}
                  </a>
                </article>
              );
            })}
          </div>
          <p className="packages-note">
            Prices in Naira, paid once a year. Pay by card, transfer or USSD through Paystack; the
            licence key and download appear immediately after payment. Need help choosing?{' '}
            <a href={support} target="_blank" rel="noreferrer">
              Message us on WhatsApp
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="demo-card">
            <span className="eyebrow">Free demo</span>
            <h2>Stop depending on a signal to make a sale.</h2>
            <p>
              Book a free demo and see AnalytIQ running on a real Windows PC with real hardware. We
              will walk through your shop&apos;s setup on WhatsApp.
            </p>
            <DemoRequest />
            <p className="demo-note">No obligation · Works offline · Support on WhatsApp</p>
          </div>
        </div>
      </section>
    </main>
  );
}
