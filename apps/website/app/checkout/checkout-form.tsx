'use client';

import { checkoutSchema, licensePlans } from '@analytiq/validation';
import { useState, type FormEvent } from 'react';
import { CheckoutError, startCheckout } from '../../lib/api';
import { formatNaira } from '../../lib/format';

type Field = 'business' | 'name' | 'email' | 'phone';

interface FieldErrors {
  business?: string;
  email?: string;
}

export default function CheckoutForm() {
  const [form, setForm] = useState({ business: '', name: '', email: '', phone: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const plan = licensePlans[0];

  function update(field: Field, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFailure('');
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure('');

    const parsed = checkoutSchema.safeParse({ plan: plan.id, ...form });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'business' || field === 'email') next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const result = await startCheckout(parsed.data);
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setFailure(
        error instanceof CheckoutError
          ? error.message
          : 'We could not start the payment. Please try again.'
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="checkout-grid">
      <div className="card">
        <form onSubmit={submit} noValidate>
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 26px' }}>
            <legend style={{ fontWeight: 600, marginBottom: 12 }}>Your package</legend>
            <div className="plan-choice" style={{ marginBottom: 0 }}>
              <label className="selected">
                <span className="choice-main">
                  <span className="choice-name">{plan.name}</span>
                  <span className="choice-sub">{plan.tagline}</span>
                </span>
                <span className="choice-price">{formatNaira(plan.priceKobo)}/year</span>
              </label>
            </div>
            <p className="fine-print" style={{ marginTop: 10 }}>
              Running more than one location? That is our cloud version —{' '}
              <a href="/#cloud-quote">request a quote</a> instead.
            </p>
          </fieldset>

          {failure ? (
            <div className="alert" role="alert">
              {failure}
            </div>
          ) : null}

          <div className="field-grid">
            <div className="field full">
              <label htmlFor="business">Business name</label>
              <input
                id="business"
                name="business"
                value={form.business}
                onChange={(event) => update('business', event.target.value)}
                placeholder="e.g. Peak Foods Stores"
                autoComplete="organization"
                required
              />
              {errors.business ? (
                <span className="hint" style={{ color: 'var(--danger)' }}>
                  {errors.business}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="Ada Obi"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone (optional)</label>
              <input
                id="phone"
                name="phone"
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="080 0000 0000"
                autoComplete="tel"
                inputMode="tel"
              />
            </div>
            <div className="field full">
              <label htmlFor="email">Email for the receipt</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              {errors.email ? (
                <span className="hint" style={{ color: 'var(--danger)' }}>
                  {errors.email}
                </span>
              ) : null}
            </div>
          </div>

          <p className="fine-print">
            The licence is tied to the business name above. You will be redirected to Paystack to
            pay by card, transfer or USSD, then returned here to collect your key.
          </p>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Opening Paystack…' : `Pay ${formatNaira(plan.priceKobo)}`}
          </button>
        </form>
      </div>

      <aside className="card" aria-label="Order summary">
        <h2>Order summary</h2>
        <div className="summary-lines">
          <div className="summary-line">
            <span>Plan</span>
            <strong>{plan.name}</strong>
          </div>
          <div className="summary-line">
            <span>Billing</span>
            <strong>12 months, paid once</strong>
          </div>
          <div className="summary-line">
            <span>Key delivery</span>
            <strong>Shown here after payment</strong>
          </div>
        </div>
        <ul
          style={{
            paddingLeft: 18,
            margin: '0 0 20px',
            color: 'var(--ink-soft)',
            fontSize: '0.9rem',
          }}
        >
          {plan.features.map((feature) => (
            <li key={feature} style={{ marginBottom: 6 }}>
              {feature}
            </li>
          ))}
        </ul>
        <div className="summary-total">
          <span>Total</span>
          <span>{formatNaira(plan.priceKobo)}</span>
        </div>
        <p className="fine-print">
          Payment is handled by Paystack. AnalytIQ never sees your card details. Your licence works
          offline once activated, on one computer at a time.
        </p>
      </aside>
    </div>
  );
}
