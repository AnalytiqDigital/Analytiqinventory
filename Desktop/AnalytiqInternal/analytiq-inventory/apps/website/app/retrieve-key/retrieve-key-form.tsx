'use client';

import { useState, type FormEvent } from 'react';
import { CheckoutError, retrieveKey, type OrderView } from '../../lib/api';
import { formatDate, formatNaira } from '../../lib/format';
import { findLicensePlan } from '@analytiq/validation';
import { trackedDownloadUrl, whatsappUrl } from '../../lib/site';

function deliveryNote(order: OrderView): string {
  const sent: string[] = [];
  if (order.delivery?.email?.state === 'sent') sent.push(`email to ${order.email}`);
  if (order.delivery?.whatsapp?.state === 'sent') sent.push('WhatsApp');
  if (sent.length === 0) return '';
  return `A copy was also delivered by ${sent.join(' and ')}.`;
}

export default function RetrieveKeyForm() {
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<OrderView | null>(null);
  const [failure, setFailure] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure('');
    setOrder(null);
    setSubmitting(true);
    try {
      setOrder(await retrieveKey(reference.trim(), email.trim()));
    } catch (error) {
      setFailure(
        error instanceof CheckoutError
          ? error.message
          : 'We could not check that order. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyKey(): Promise<void> {
    if (!order?.licenseKey) return;
    try {
      await navigator.clipboard.writeText(order.licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailure('Copying is blocked in this browser. Select the key and copy it manually.');
    }
  }

  if (order) {
    const licenceDays = findLicensePlan(order.planId)?.days ?? 365;
    const issuedAt = new Date(order.paidAt ?? order.createdAt);
    const expiresOn =
      order.expiresAt ??
      new Date(issuedAt.getTime() + licenceDays * 24 * 60 * 60 * 1000).toISOString();
    const note = deliveryNote(order);

    return (
      <div className="success-card">
        <div className="status-dot">✓</div>
        <h1>Your licence key</h1>
        <p className="lede">
          {order.planName} for <strong>{order.business}</strong>, valid until{' '}
          {formatDate(expiresOn)}. Copy the key somewhere safe. {note}
        </p>

        <div className="key-box">
          <label htmlFor="retrieved-key">Licence key</label>
          <textarea id="retrieved-key" readOnly value={order.licenseKey ?? ''} />
        </div>

        <div className="success-actions" style={{ marginTop: 0 }}>
          <button className="btn btn-primary" type="button" onClick={() => void copyKey()}>
            {copied ? 'Copied' : 'Copy licence key'}
          </button>
          <a
            className="btn btn-outline"
            href={trackedDownloadUrl({
              reference: order.reference,
              email: order.email,
              source: 'retrieve',
            })}
          >
            Download the installer
          </a>
        </div>

        <div className="summary-lines" style={{ textAlign: 'left' }}>
          <div className="summary-line">
            <span>Order reference</span>
            <strong style={{ wordBreak: 'break-all' }}>{order.reference}</strong>
          </div>
          <div className="summary-line">
            <span>Amount paid</span>
            <strong>{formatNaira(order.amountKobo)}</strong>
          </div>
        </div>

        <p className="fine-print">
          Activate the key in the app under Settings → Licence, then{' '}
          <a
            href={whatsappUrl(`Hi AnalytIQ, please help me activate key ${order.reference}.`)}
            target="_blank"
            rel="noreferrer"
          >
            message us on WhatsApp
          </a>{' '}
          if you get stuck.
        </p>

        {failure ? <div className="alert">{failure}</div> : null}
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        {failure ? (
          <div className="alert" role="alert">
            {failure}
          </div>
        ) : null}
        <div className="field-grid">
          <div className="field full">
            <label htmlFor="reference">Order reference</label>
            <input
              id="reference"
              name="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="ord_…"
              autoComplete="off"
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="retrieve-email">Email used at checkout</label>
            <input
              id="retrieve-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Checking your order…' : 'Show my licence key'}
        </button>
      </form>
    </div>
  );
}
