import { licensePlans } from '@analytiq/validation';
import { formatNaira } from '../lib/format';

const features = [
  {
    icon: '₦',
    title: 'Sell at the till',
    body: 'Fast point of sale with receipts, split payments, discounts and a daily sales summary you can trust.',
  },
  {
    icon: '▤',
    title: 'Know your stock',
    body: 'Track inventory across locations, get low-stock alerts before you run out, and record stock counts in minutes.',
  },
  {
    icon: '↺',
    title: 'Customer credit',
    body: 'Record part payments and outstanding balances per customer, with statements you can print or share.',
  },
  {
    icon: '⬒',
    title: 'Supplier purchasing',
    body: 'Raise purchase orders, receive stock and keep supplier balances straight without a separate ledger.',
  },
  {
    icon: '✦',
    title: 'WhatsApp alerts',
    body: 'Low-stock and end-of-day summaries sent to the WhatsApp number you already check.',
  },
  {
    icon: '⌂',
    title: 'One shop or many',
    body: 'Run several tills on one LAN, or sync branches to a central stock ledger with the Pro plan.',
  },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">Built for Nigerian shops</span>
            <h1>Stock, sales and customer credit in one place.</h1>
            <p className="lede">
              AnalytIQ is a desktop inventory and point-of-sale app your staff can learn in an
              afternoon. It works offline, syncs across your tills, and tells you what is selling
              before the shelf is empty.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#pricing">
                See plans and pricing
              </a>
              <a className="btn btn-outline" href="/checkout">
                Buy a licence
              </a>
            </div>
            <p className="hero-note">
              14-day free trial. Licence keys activate offline — once installed, the shop does not
              need internet to keep selling.
            </p>
          </div>
          <aside className="receipt-card" aria-label="Sample receipt">
            <h3>Peak Foods — Ikeja</h3>
            <div className="receipt-meta">Receipt #00418 · Cashier: Ada · 18 Nov 2026</div>
            <div className="receipt-row">
              <span>Peak Milk 400g × 2</span>
              <span>₦3,400.00</span>
            </div>
            <div className="receipt-row">
              <span>Golden Penny Semovita 1kg</span>
              <span>₦1,250.00</span>
            </div>
            <div className="receipt-row">
              <span>Bag of sachet water</span>
              <span>₦250.00</span>
            </div>
            <div className="receipt-total">
              <span>Total</span>
              <span>₦4,900.00</span>
            </div>
            <p style={{ margin: '16px 0 8px', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Today: <strong>₦186,450.00</strong> across 47 sales
            </p>
            <span className="stock-pill low">Peak Milk running low — 4 left</span>
          </aside>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <h2>Everything a shop actually uses</h2>
            <p>
              No modules you will never switch on. The till, the stock book, the credit book and the
              day-end report — designed to work on the equipment you already have.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature" key={feature.title}>
                <div className="icon" aria-hidden="true">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section wash" id="pricing">
        <div className="container">
          <div className="section-head">
            <h2>One price per year</h2>
            <p>
              Every plan includes the full till, inventory and reporting suite. Pay once a year;
              your licence keeps working offline.
            </p>
          </div>
          <div className="plan-grid">
            {licensePlans.map((plan) => (
              <article className={`plan${plan.id === 'standard' ? ' featured' : ''}`} key={plan.id}>
                {plan.id === 'standard' ? <span className="plan-badge">Most popular</span> : null}
                <h3>{plan.name}</h3>
                <p className="tagline">{plan.tagline}</p>
                <div className="price">{formatNaira(plan.priceKobo)}</div>
                <div className="period">per year, per business</div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a
                  className={`btn ${plan.id === 'standard' ? 'btn-primary' : 'btn-outline'}`}
                  href={`/checkout?plan=${plan.id}`}
                >
                  Choose {plan.name}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container">
          <div className="section-head">
            <h2>Questions shops ask us</h2>
          </div>
          <div className="faq">
            <details>
              <summary>Do I need internet in the shop?</summary>
              <p>
                No. AnalytIQ runs on your computer and keeps working offline. Internet is only
                needed for WhatsApp alerts, branch sync and app updates.
              </p>
            </details>
            <details>
              <summary>What happens after I pay?</summary>
              <p>
                Your licence key appears on the confirmation page immediately. Copy it, open the
                app, go to Settings → Licence and paste it in. Activation is offline.
              </p>
            </details>
            <details>
              <summary>Can I move the licence to a new computer?</summary>
              <p>
                Yes. Deactivate on the old machine in Settings → Licence, then activate the same key
                on the new one.
              </p>
            </details>
            <details>
              <summary>How many tills can I run?</summary>
              <p>
                Starter covers one till, Standard three tills across two locations, and Pro is
                unlimited with branch sync. Tills on the same network share one database.
              </p>
            </details>
            <details>
              <summary>Is my business data mine?</summary>
              <p>
                Yes. Everything lives in a database file on your computer, with daily automatic
                backups you can copy to a drive or cloud folder.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="section wash">
        <div className="container" style={{ textAlign: 'center' }}>
          <h2>Ready when your next customer walks in</h2>
          <p style={{ color: 'var(--ink-soft)', maxWidth: 560, margin: '0 auto 26px' }}>
            Start the 14-day trial today. When you are ready, buy a licence online and keep the same
            data — nothing to re-enter.
          </p>
          <a className="btn btn-primary" href="/checkout">
            Buy a licence
          </a>
        </div>
      </section>
    </main>
  );
}
