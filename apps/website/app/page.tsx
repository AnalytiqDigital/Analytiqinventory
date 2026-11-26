import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { licensePlans } from '@analytiq/validation';
import { DemoRequest } from '../components/DemoRequest';
import { QuoteRequest } from '../components/QuoteRequest';
import { formatNaira } from '../lib/format';
import {
  COMPANY_SITE,
  COMPANY_SITE_LABEL,
  CLOUD_LOCATION_ANCHOR_KOBO,
  DEFAULT_INSTALLER_URL,
  INSTALLER_SHA256,
  INSTALLER_SIZE_LABEL,
  INSTALLER_VERSION,
  SUPPORT_HOURS,
  SUPPORT_PHONE_LABEL,
  SUPPORT_WHATSAPP_LABEL,
  TUTORIAL_YOUTUBE_ID,
  YOUTUBE_CHANNEL,
  YOUTUBE_CHANNEL_LABEL,
  callUrl,
  downloadUrl,
  trackedDownloadUrl,
  whatsappUrl,
} from '../lib/site';

export const metadata: Metadata = {
  title: 'AnalytIQ Inventory & POS — keep selling when the network is down',
  description:
    'Offline-first inventory and point-of-sale software for Windows. Record sales, track stock and print receipts without internet. 14-day free trial.',
};

const reportBars = [30, 52, 44, 68, 40, 82, 58];

const promises = [
  {
    icon: 'offline',
    title: 'Keep the till open',
    body: 'Sales, stock changes and receipts run on your shop computer. No signal needed at the counter.',
    href: '#offline',
    link: 'See what works offline ↓',
  },
  {
    icon: 'insight',
    title: 'See the day clearly',
    body: "Today's sales, what is left on the shelf, what to reorder and what you earned — on one screen.",
    href: '#outcomes',
    link: 'See the daily view ↓',
  },
  {
    icon: 'shield',
    title: 'Trust the records',
    body: 'Automatic daily backups, a restore that checks the file first, CSV reports and written licence terms.',
    href: '#data-safety',
    link: 'How your data is kept ↓',
  },
] as const;

const outcomes = [
  {
    stat: 'Today',
    title: 'What sold today',
    body: 'Receipts, totals and the payment mix — cash, transfer, POS or credit — update as you sell.',
  },
  {
    stat: 'Stock',
    title: 'What is left',
    body: 'Every sale drops the stock count. Stock takes and adjustments are recorded against your name.',
  },
  {
    stat: 'Reorder',
    title: 'What to buy next',
    body: 'A low-stock list shows what is running out, and it can send itself to WhatsApp.',
  },
  {
    stat: 'Profit',
    title: 'What you earned',
    body: 'Daily, weekly and monthly reports with best sellers, totals and profit. Export any report to CSV.',
  },
] as const;

const offlineWorks = [
  'Ringing up and completing sales',
  'Stock counts, receipts and adjustments',
  'Printing receipts on a supported thermal printer',
  'Daily, weekly and monthly reports, and CSV export',
  'Licence activation with a key',
  'Automatic daily backups, manual backup and restore',
] as const;

const needsInternet = [
  'Buying or renewing a licence, and downloading the installer',
  'Getting app updates',
  'WhatsApp low-stock alerts that you switch on',
  'The cloud version that links separate locations',
  'Messaging support on WhatsApp',
] as const;

const alsoIncluded = [
  'Customer accounts and credit limits',
  'Supplier purchases and stock receipts',
  'Expenses and finance records',
  'Tax categories',
  'Restaurant tables',
  'Batches and expiry tracking',
  'Wholesale price lists',
  'Loyalty points and customer notes',
  'Returns and exchanges by receipt',
  'Staff roles and permissions',
  'Product import and report export to CSV',
  'WhatsApp low-stock alerts',
] as const;

const setupSteps = [
  'Pay on this site by card, transfer or USSD through Paystack. Your licence key appears on screen straight after payment.',
  'Download the installer and allow it to run. Windows will warn that the publisher is unknown until the installer is signed.',
  'Install, open the app and paste your key on the licence screen. Activation needs the internet once; after that the app works offline.',
  'Follow the setup wizard, then add products by hand or import a CSV file.',
  'Connect your receipt printer and scanner in Settings, then ring your first sale.',
] as const;

const recoverySteps = [
  'Get a replacement Windows PC that meets the minimum specification.',
  'Install AnalytIQ from this site. The 14-day trial starts automatically.',
  'Copy your latest backup from your flash drive or cloud folder.',
  'Open Settings → Backups, choose the file and restore it. AnalytIQ takes a safety copy first.',
  'Message us on WhatsApp to activate your licence on the new machine.',
] as const;

const faqs: { question: string; answer: ReactNode }[] = [
  {
    question: 'Do I need internet to use it?',
    answer:
      'No. Selling, stock, reports, receipts, licence activation and backups work without internet. You only need internet to buy or renew a licence, download updates, send WhatsApp alerts, sync branches or chat with support.',
  },
  {
    question: 'What happens if the power goes off mid-sale?',
    answer:
      'A sale is written to the local database in one transaction, so it is saved in full or not at all — you will not get a sale that looks complete but is missing items. We have not yet published a measured power-cut test; if this matters for your shop, ask us on WhatsApp and we will run it with you.',
  },
  {
    question: 'What if my computer breaks? How do I recover my records?',
    answer:
      'Your records live in the app data folder on the shop PC, so the backup copy is what saves you. Install AnalytIQ on the replacement PC, restore your latest backup from Settings → Backups, then message us on WhatsApp to activate your licence there.',
  },
  {
    question: 'Can I move the licence to a new PC?',
    answer:
      'The key is tied to the PC it was activated on. Message us on WhatsApp with the installation ID shown on the licence screen and we will help you move it to the replacement machine.',
  },
  {
    question: 'What happens after my 12 months end?',
    answer:
      'The app opens on the licence screen and selling pauses. Your records are not deleted. Buy a new 12-month key from this site, paste it in and you are back in.',
  },
  {
    question: 'Are updates and support included?',
    answer:
      'WhatsApp support is included. Updates are optional: install the newer version over the old one when you are ready. Your data stays, and we recommend taking a backup first.',
  },
  {
    question: 'Is installation help included?',
    answer:
      'Yes. The installation guide walks through each step, and you can message us on WhatsApp while you install. Support covers installation, activation and defects in the software.',
  },
  {
    question: 'Which printers, scanners and cash drawers work?',
    answer: (
      <>
        AnalytIQ is documented for Xprinter 58 mm and 80 mm thermal printers and USB keyboard-wedge
        barcode scanners. Other Windows printers with their own driver, and Bluetooth scanners that
        act as keyboards, should work. Automatic cash-drawer opening and barcode-label printing are
        not verified yet — test them during the trial or{' '}
        <a href={whatsappUrl('Hi AnalytIQ, I want to check if my hardware works.')}>ask us first</a>
        .
      </>
    ),
  },
  {
    question: 'Why does Windows warn me during installation?',
    answer:
      'The installer is not yet signed with a paid code-signing certificate, so Windows SmartScreen shows an unknown publisher. Choose More info → Run anyway. The SHA-256 checksum of the installer is published on the download page so you can confirm the file is intact.',
  },
  {
    question: 'Who can see my data?',
    answer:
      'Your database sits on your shop computer. Staff see only what their role allows. We do not receive your sales data unless you turn on WhatsApp alerts or branch sync, and those use credentials you provide.',
  },
  {
    question: 'Can I export my data?',
    answer:
      'Every report exports to CSV, which opens in Excel or Google Sheets. Your whole database is a standard SQLite file, and every backup is a copy of it that you can move to another drive.',
  },
  {
    question: 'Why is a second location a separate quote?',
    answer: (
      <>
        The {formatNaira(licensePlans[0].priceKobo)} package covers one shop location. More than one
        location runs on our cloud version, which keeps a central stock ledger across branches and
        needs internet to sync. Cloud starts at {formatNaira(CLOUD_LOCATION_ANCHOR_KOBO)} per
        location, per year; the final quote covers the number of locations and tills, onboarding,
        migration and hosting — so we quote it with you instead of guessing. Use the{' '}
        <a href="#cloud-quote">cloud quote form</a> and we will reply on WhatsApp.
      </>
    ),
  },
  {
    question: 'How do extra tills at the same shop work?',
    answer:
      'Extra tills connect to the main computer over your shop’s local network with no extra licence. Separate locations are the cloud version above, which we quote per setup.',
  },
  {
    question: 'What is your refund policy?',
    answer: (
      <>
        Try the free 14-day trial first. If a licence is not activated, you can cancel within 7 days
        for a full refund. If a key cannot be activated and we cannot fix it within 5 business days,
        or a material defect is reported within 30 days and cannot be repaired, you can choose a
        replacement or a refund. Read the full <a href="/legal/refund">refund policy</a>.
      </>
    ),
  },
];

function PromiseIcon({ name }: { name: (typeof promises)[number]['icon'] }): JSX.Element {
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
  if (name === 'offline') {
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
  if (name === 'insight') {
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function DeviceIcon({
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
  const plan = licensePlans[0];
  const installer = downloadUrl();
  const demo = whatsappUrl(
    'Hi AnalytIQ, I would like a 20-minute demo of the inventory app on WhatsApp.'
  );
  const support = whatsappUrl('Hi AnalytIQ, I need help with the inventory app.');

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Offline-first inventory &amp; POS · Windows</span>
            <h1>
              Keep selling <span>when the network is down.</span>
            </h1>
            <p className="lede">
              AnalytIQ runs on your Windows PC. Record sales, track stock and print receipts without
              internet, and keep your records in your own shop.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/download">
                Start your 14-day free trial
              </a>
              <a className="btn btn-outline" href={demo} target="_blank" rel="noreferrer">
                Book a 20-minute demo
              </a>
            </div>
            <ul className="hero-pills" aria-label="At a glance">
              <li>Works offline</li>
              <li>One package · {formatNaira(plan.priceKobo)}/year</li>
              <li>Cloud version for 2+ locations</li>
            </ul>
            <p className="hero-note">
              Windows 10/11 (64-bit) · 4 GB RAM · 500 MB disk · No card needed for the trial
            </p>
          </div>

          <figure className="hero-shot" aria-label="The AnalytIQ dashboard">
            <div className="hero-shot-bar" aria-hidden="true">
              <span className="mock-dots">
                <i />
                <i />
                <i />
              </span>
              <span>AnalytIQ — dashboard</span>
            </div>
            <Image
              src="/app-dashboard.webp"
              alt="AnalytIQ dashboard with today's sales, monthly gross and net profit, outstanding credit, low stock alerts, a 7-day sales chart and payment mix"
              width={2000}
              height={1279}
              sizes="(max-width: 1040px) 100vw, 600px"
              priority
            />
            <figcaption>
              Your dashboard, calculated from your own ledger. Sample data from a fresh shop.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="pillars" id="features">
        <div className="container promise-grid">
          {promises.map((promise) => (
            <article className="promise" key={promise.title}>
              <span className="pillar-icon">
                <PromiseIcon name={promise.icon} />
              </span>
              <div>
                <h3>{promise.title}</h3>
                <p>{promise.body}</p>
                <a className="promise-link" href={promise.href}>
                  {promise.link}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-soft" id="industries">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Warehouse · Supermarket · Till</span>
            <h2>Built for the three places your stock lives</h2>
            <p>
              The same records follow every item from the delivery bay, to the shelf, to the
              customer&apos;s receipt.
            </p>
          </div>
          <div className="industry-grid">
            <article className="industry-card">
              <div className="industry-media">
                <Image
                  src="/warehouse.png"
                  alt="Warehouse shelves stacked with cartons while a worker scans stock"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 33vw"
                />
                <span className="industry-tag">Warehouse &amp; wholesale</span>
              </div>
              <div className="industry-body">
                <h3>Know what is in every carton</h3>
                <p>
                  Receive deliveries from suppliers, record batch numbers and expiry dates, and see
                  exactly what is left before you promise stock to a customer.
                </p>
              </div>
            </article>
            <article className="industry-card">
              <div className="industry-media">
                <Image
                  src="/supermarket.png"
                  alt="Cashier serving a customer at a supermarket checkout"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 33vw"
                />
                <span className="industry-tag">Supermarket &amp; provision</span>
              </div>
              <div className="industry-body">
                <h3>Keep the queue moving</h3>
                <p>
                  Scan or search, take cash, transfer, POS or customer credit, then print the
                  receipt while stock drops on its own — all without waiting for a signal.
                </p>
              </div>
            </article>
            <article className="industry-card">
              <div className="industry-media">
                <Image
                  src="/pos-computer.png"
                  alt="Point-of-sale computer, receipt printer, scanner and cash drawer on a shop counter"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 33vw"
                />
                <span className="industry-tag">POS computer &amp; till</span>
              </div>
              <div className="industry-body">
                <h3>Use the computer you already own</h3>
                <p>
                  Any Windows 10 or 11 PC, an Xprinter receipt printer and a USB scanner. Set them
                  up in Settings, then ring your first sale.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="outcomes">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">A day at the counter</span>
            <h2>Know what sold today, what is left, what to reorder and what you earned</h2>
            <p>One screen at the counter answers the four questions a shop owner asks every day.</p>
          </div>
          <div className="outcome-grid">
            {outcomes.map((outcome) => (
              <article className="outcome" key={outcome.title}>
                <span className="outcome-tag">{outcome.stat}</span>
                <h3>{outcome.title}</h3>
                <p>{outcome.body}</p>
              </article>
            ))}
          </div>
          <div className="chip-block">
            <h3>Also included on AnalytIQ</h3>
            <ul className="chip-list">
              {alsoIncluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section-dashboard" id="screens">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">The screens</span>
            <h2>What the app looks like</h2>
            <p>
              Real screens from the app, followed by illustrated panels with sample data. The free
              trial is the live product.
            </p>
          </div>

          <div className="shot-grid">
            <figure className="shot shot-wide">
              <div className="shot-media">
                <Image
                  src="/app-dashboard.webp"
                  alt="AnalytIQ dashboard with today's sales, monthly profit, outstanding credit, low stock alerts, a 7-day sales chart and payment mix"
                  width={2000}
                  height={1279}
                  sizes="(max-width: 1040px) 100vw, 1160px"
                />
              </div>
              <figcaption>
                <strong>Dashboard</strong> — sales, profit, credit and stock for the day and the
                month, with the last 7 days and your payment mix.
              </figcaption>
            </figure>
            <figure className="shot shot-wide">
              <div className="shot-media">
                <Image
                  src="/app-pos.webp"
                  alt="AnalytIQ Point of Sale screen with a product grid, category tabs, the current cart, discount and the charge button"
                  width={2000}
                  height={1281}
                  sizes="(max-width: 1040px) 100vw, 1160px"
                />
              </div>
              <figcaption>
                <strong>Point of Sale</strong> — tap or scan to build the cart, take a discount,
                then charge. F9 opens payment and Alt+Shift+C clears the cart.
              </figcaption>
            </figure>
            <figure className="shot">
              <div className="shot-media">
                <Image
                  src="/app-login-market.jpg"
                  alt="AnalytIQ sign-in screen over a photograph of a Lagos market"
                  width={1600}
                  height={992}
                  sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 570px"
                />
              </div>
              <figcaption>
                <strong>Sign in</strong> — the app login screen, dressed for the market.
              </figcaption>
            </figure>
            <figure className="shot">
              <div className="shot-media">
                <Image
                  src="/app-login-supermarket.jpg"
                  alt="AnalytIQ sign-in screen over a photograph of a supermarket checkout"
                  width={1600}
                  height={999}
                  sizes="(max-width: 760px) 100vw, (max-width: 1040px) 50vw, 570px"
                />
              </div>
              <figcaption>
                <strong>Sign in</strong> — the same screen on a supermarket lane.
              </figcaption>
            </figure>
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
              <h3>Checkout</h3>
              <p>
                Search, scan or tap a product. Take cash, transfer, POS or credit, including split
                payments.
              </p>
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
              <p>
                Daily, weekly and monthly totals, best sellers and profit. Export any report to CSV.
              </p>
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
              <h3>Barcode scanning</h3>
              <p>A USB scanner types straight into the Sell screen. No driver or setup wizard.</p>
              <Barcode />
              <div className="label-line">
                <span>Scanned: PEAK-MLK-400</span>
                <span>Peak Milk 400g</span>
              </div>
            </article>

            <article className="panel">
              <h3>Staff roles &amp; permissions</h3>
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

      <section className="section section-tutorial" id="tutorial">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Video tutorial</span>
            <h2>Watch the app being used, start to finish</h2>
            <p>
              Set up the shop, ring a sale, take cash and transfer, print a receipt, make a refund
              and read the day report — in one walkthrough.
            </p>
          </div>
          <div className="video-frame">
            {TUTORIAL_YOUTUBE_ID ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${TUTORIAL_YOUTUBE_ID}`}
                title="AnalytIQ Inventory & POS tutorial"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="video-placeholder">
                <span className="video-play" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.2v13.6L19 12 8 5.2z" />
                  </svg>
                </span>
                <strong>The tutorial video is on its way</strong>
                <p>
                  Want a walkthrough now? Book a live demo on WhatsApp and we will screen-share the
                  app with you.
                </p>
                <a className="btn btn-primary" href={demo} target="_blank" rel="noreferrer">
                  Book a 20-minute demo
                </a>
              </div>
            )}
          </div>
          <p className="video-note">
            Prefer reading? The <a href="/docs/usage">usage guide</a> covers the same steps.
            Walkthroughs are published on our{' '}
            <a href={YOUTUBE_CHANNEL} target="_blank" rel="noreferrer">
              {YOUTUBE_CHANNEL_LABEL} YouTube channel
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section" id="offline">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Offline-first</span>
            <h2>What works without internet — and what needs it</h2>
            <p>
              AnalytIQ is offline-first, not offline-only. Selling never waits for a signal; the
              internet is only needed for the services below.
            </p>
          </div>
          <div className="offline-grid">
            <article className="offline-col works">
              <h3>
                <span className="mark ok" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>{' '}
                Works offline
              </h3>
              <ul>
                {offlineWorks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="offline-col needs">
              <h3>
                <span className="mark wait" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <path d="M12 6.5v7" />
                    <circle cx="12" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                </span>{' '}
                Needs internet
              </h3>
              <ul>
                {needsInternet.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
          <p className="offline-note">
            When you reconnect, anything that needs the internet catches up: the cloud version sends
            changes between locations, and WhatsApp alerts go out on the next scheduled run.
          </p>
        </div>
      </section>

      <section className="section section-soft" id="data-safety">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Your data</span>
            <h2>Your records stay in your shop — and you can take them with you</h2>
            <p>
              AnalytIQ has no remote access to your business data. Here is exactly how it is kept,
              and what to do if a computer dies.
            </p>
          </div>
          <div className="safety-grid">
            <article className="safety-card">
              <h3>Where the records live</h3>
              <p>
                Products, sales, customers and stock are stored in a database file in the app&apos;s
                data folder on the shop computer. Nobody at Analytiq can open it remotely.
              </p>
            </article>
            <article className="safety-card">
              <h3>Automatic backups</h3>
              <p>
                A daily backup runs while the app is open and the last 14 copies are kept. You can
                also take a manual backup at any time from Settings → Backups.
              </p>
            </article>
            <article className="safety-card">
              <h3>Copy them off the PC</h3>
              <p>
                Backups sit in the app data folder by default — on the same disk as the database. A
                dead PC loses both, so copy backups to a flash drive or cloud folder.
              </p>
            </article>
            <article className="safety-card">
              <h3>Restore with a check</h3>
              <p>
                Restoring verifies the backup file and takes a safety copy of the current database
                first, so a wrong restore can be undone.
              </p>
            </article>
            <article className="safety-card">
              <h3>Export when you need it</h3>
              <p>
                Every report exports to CSV for Excel or Google Sheets. The full database is a
                standard SQLite file, and every backup is a copy of it.
              </p>
            </article>
            <article className="safety-card">
              <h3>Plain, not encrypted</h3>
              <p>
                Backups are not encrypted. Keep them on a drive or account that only you can open.
              </p>
            </article>
          </div>

          <div className="recovery">
            <div>
              <h3>If a computer dies, here is the recovery path</h3>
              <p>
                You cannot deactivate a dead PC. Restore your backup on the replacement machine and
                message us — we will activate your licence there.
              </p>
            </div>
            <ol className="steps">
              {recoverySteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section" id="hardware">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Hardware</span>
            <h2>What we document, what should work, and what to test first</h2>
            <p>
              We list only what the software and guides support. The free trial lets you test your
              own printer and scanner before you pay.
            </p>
          </div>
          <div className="hardware-grid">
            <article className="hardware">
              <span className="hardware-icon">
                <DeviceIcon name="terminal" />
              </span>
              <span className="device-status documented">Documented</span>
              <h3>POS computer</h3>
              <p>Any Windows 10 or 11 PC, all-in-one or laptop, 64-bit with 4 GB RAM.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <DeviceIcon name="scanner" />
              </span>
              <span className="device-status documented">Documented</span>
              <h3>Barcode scanner</h3>
              <p>USB keyboard-wedge scanners work on the Sell screen without a driver.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <DeviceIcon name="printer" />
              </span>
              <span className="device-status documented">Documented</span>
              <h3>Receipt printer</h3>
              <p>Xprinter 58 mm and 80 mm thermal printers, picked in Settings → Printing.</p>
            </article>
            <article className="hardware">
              <span className="hardware-icon">
                <DeviceIcon name="drawer" />
              </span>
              <span className="device-status test">Test first</span>
              <h3>Cash drawer &amp; labels</h3>
              <p>
                Automatic drawer opening and barcode-label printing are not verified yet. Ask us
                before you rely on them.
              </p>
            </article>
          </div>
          <p className="packages-note">
            Other Windows printers with their own driver, and Bluetooth scanners that act as
            keyboards, should work. Test them during the trial, and{' '}
            <a href={whatsappUrl('Hi AnalytIQ, will my printer or scanner work?')}>ask us</a> if you
            are unsure.
          </p>
        </div>
      </section>

      <section className="section section-soft" id="who">
        <div className="container split">
          <div className="illustration-card">
            <Image
              src="/supermarket.png"
              alt="Cashier serving a customer at a supermarket checkout"
              width={1536}
              height={1024}
              sizes="(max-width: 1040px) 100vw, 45vw"
            />
            <span className="float-chip chip-top">Sale complete</span>
            <span className="float-chip chip-bottom">Stock updated</span>
          </div>
          <div className="split-copy">
            <span className="eyebrow">Who it is for</span>
            <h2>Designed for shops that cannot pause when the signal drops</h2>
            <p>
              One product, set up for the way Nigerian shops actually work — buying from suppliers,
              selling on credit, taking cash, transfer and POS, and closing the day with records
              that agree.
            </p>
            <ul className="who-list">
              <li>Provision store</li>
              <li>Pharmacy</li>
              <li>Boutique or fashion shop</li>
              <li>Electronics or phone shop</li>
              <li>Wholesaler</li>
              <li>Restaurant or bar</li>
              <li>Multi-branch business (cloud quote)</li>
            </ul>
            <a className="text-link" href="/docs/usage">
              See how a day looks in AnalytIQ →
            </a>
          </div>
        </div>
      </section>

      <section className="section section-packages" id="packages">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2>One package. One price.</h2>
            <p>
              Everything that runs in the shop is included: {formatNaira(plan.priceKobo)} per year
              for one location, paid once. Start with the 14-day free trial.
            </p>
          </div>

          <div className="pricing-grid">
            <article className="package package-single">
              <span className="package-badge">Everything included</span>
              <div className="package-media">
                <Image
                  src="/pos-computer.png"
                  alt="Point-of-sale computer with receipt printer, scanner and cash drawer"
                  width={1536}
                  height={1024}
                  sizes="(max-width: 1040px) 100vw, 52vw"
                />
              </div>
              <div className="package-body">
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
                <a className="btn btn-primary btn-block" href="/checkout">
                  Buy the licence
                </a>
                <p className="fine-print package-footnote">
                  Not ready to pay? <a href="/download">Start the 14-day free trial</a> first.
                </p>
              </div>
            </article>

            <aside className="cloud-card">
              <span className="eyebrow">More than one location?</span>
              <h3>The cloud version is quoted, not sold off the shelf</h3>
              <p>
                Our cloud version links every branch to one stock ledger and a central view of
                products, prices and transfers. Each setup depends on how many locations and tills
                you have, so we price it with you.
              </p>
              <p className="cloud-anchor">
                <strong>From {formatNaira(CLOUD_LOCATION_ANCHOR_KOBO)}</strong> per location, per
                year
              </p>
              <ul className="check-list">
                <li>Two or more locations sharing one catalogue</li>
                <li>Stock transfers and central reporting across branches</li>
                <li>Onboarding, migration and training planned with you</li>
              </ul>
              <a className="btn btn-primary btn-block" href="#cloud-quote">
                Request a cloud quote
              </a>
              <p className="fine-print">
                The final quote covers locations, tills, onboarding and migration. No card needed to
                ask.
              </p>
            </aside>
          </div>

          <div className="quote-panel" id="cloud-quote">
            <div className="quote-copy">
              <span className="eyebrow">Cloud quote</span>
              <h3>Tell us about your locations</h3>
              <p>
                Fill this in and the details open in WhatsApp, ready to send. We reply during
                working hours (West Africa Time) with a written quote for your setup.
              </p>
              <ul className="check-list">
                <li>Number of locations and tills</li>
                <li>How the branches should sync</li>
                <li>Migration from paper, Excel or another POS</li>
              </ul>
            </div>
            <QuoteRequest />
          </div>

          <div className="callout pricing-callout">
            <strong>When your 12 months end:</strong> the app opens on the licence screen and
            selling pauses. Your records stay on the PC. Buy a new 12-month key from this site,
            paste it in, and you are back in.
          </div>

          <p className="packages-note">
            Pay by card, transfer or USSD through Paystack. Your licence key appears on screen
            straight after payment — save it. If the page closes before you do, message support with
            your Paystack reference and we will resend it. Questions about the package?{' '}
            <a href={support} target="_blank" rel="noreferrer">
              Message us on WhatsApp
            </a>
            .
          </p>
        </div>
      </section>

      <section className="section" id="support">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Support &amp; onboarding</span>
            <h2>From payment to your first sale</h2>
            <p>
              Support is on WhatsApp at {SUPPORT_WHATSAPP_LABEL} or call {SUPPORT_PHONE_LABEL}. We
              reply {SUPPORT_HOURS}; installation and activation issues are answered the same
              working day.
            </p>
          </div>
          <div className="support-grid">
            <ol className="steps">
              {setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <aside className="support-card">
              <h3>What support covers</h3>
              <ul className="check-list">
                <li>Installation and first-run setup</li>
                <li>Licence activation and moving to a new PC</li>
                <li>Defects in the software</li>
                <li>Backups and restoring your records</li>
              </ul>
              <p>
                Support does not cover Windows, printer or network problems outside the app — but we
                will help you diagnose them.
              </p>
              <a
                className="btn btn-primary btn-block"
                href={support}
                target="_blank"
                rel="noreferrer"
              >
                Message support on WhatsApp
              </a>
              <a className="btn btn-outline btn-block" href={callUrl()}>
                Call {SUPPORT_PHONE_LABEL}
              </a>
            </aside>
          </div>
          <p className="fine-print version-line">
            Current version {INSTALLER_VERSION} · Installer size {INSTALLER_SIZE_LABEL}
            {installer === DEFAULT_INSTALLER_URL ? (
              <>
                {' '}
                · SHA-256 <code className="hash">{INSTALLER_SHA256}</code>
              </>
            ) : null}
          </p>
        </div>
      </section>

      <section className="section section-soft" id="about">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Company</span>
            <h2>About AnalytIQ Digital</h2>
            <p>
              Analytiq Digital is a Nigerian technology and digital transformation company based in
              Abuja, working with businesses and institutions on the data, software, and automation
              problems that quietly cost the most time and money. AnalytIQ Inventory &amp; POS is
              one of our products —{' '}
              <a href={COMPANY_SITE} target="_blank" rel="noreferrer">
                {COMPANY_SITE_LABEL}
              </a>
              .
            </p>
          </div>
          <div className="company-grid">
            <article className="company-card">
              <h3>Who we are</h3>
              <p>
                We build and support the software ourselves, and publish the app, the guides and the
                licence terms on this site.
              </p>
            </article>
            <article className="company-card">
              <h3>Contact</h3>
              <p>
                WhatsApp: {SUPPORT_WHATSAPP_LABEL} · Calls: {SUPPORT_PHONE_LABEL}. {SUPPORT_HOURS}.
              </p>
              <a className="text-link" href={support} target="_blank" rel="noreferrer">
                Open WhatsApp →
              </a>{' '}
              <a className="text-link" href={callUrl()}>
                Call support →
              </a>
            </article>
            <article className="company-card">
              <h3>Policies</h3>
              <p>
                <a href="/legal/terms">Terms of use</a> ·{' '}
                <a href="/legal/privacy">Privacy notice</a> ·{' '}
                <a href="/legal/refund">Refund policy</a>
              </p>
              <p className="footer-muted">
                Your shop records stay on your PC. WhatsApp alerts send a message through WhatsApp,
                and branch sync sends data only to the endpoint you configure.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h2>Answers before you buy</h2>
            <p>If your question is not here, message us on WhatsApp and we will answer it.</p>
          </div>
          <div className="faq">
            {faqs.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <div className="faq-answer">{item.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="demo">
        <div className="container">
          <div className="demo-card">
            <span className="eyebrow">Start today</span>
            <h2>Try it free for 14 days on your own shop computer</h2>
            <p>
              Install the trial, ring a test sale and print a receipt. Or book a 20-minute
              walkthrough and we will set it up with you on WhatsApp.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <a className="btn btn-primary" href={trackedDownloadUrl({ source: 'public' })}>
                Download the free trial
              </a>
              <a className="btn btn-outline" href={demo} target="_blank" rel="noreferrer">
                Book a demo on WhatsApp
              </a>
            </div>
            <DemoRequest />
            <p className="demo-note">
              Windows 10/11 (64-bit) · {INSTALLER_SIZE_LABEL} download · Works offline · Support on
              WhatsApp
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
