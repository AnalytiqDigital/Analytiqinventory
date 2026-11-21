'use client';

import { findLicensePlan } from '@analytiq/validation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckoutError, fetchOrder, type OrderView } from '../../../lib/api';
import { formatDate, formatNaira } from '../../../lib/format';
import { downloadUrl, whatsappUrl } from '../../../lib/site';

const POLL_MS = 3000;
const MAX_ATTEMPTS = 40;

export default function SuccessStatus() {
  const search = useSearchParams();
  const reference = search.get('reference') ?? search.get('trxref') ?? '';
  const [order, setOrder] = useState<OrderView | null>(null);
  const [failure, setFailure] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let tries = 0;

    async function poll(): Promise<void> {
      try {
        const next = await fetchOrder(reference);
        if (cancelled) return;
        setOrder(next);
        setFailure('');
        if (next.status === 'pending' && tries < MAX_ATTEMPTS) {
          tries += 1;
          setAttempts(tries);
          timer.current = setTimeout(() => void poll(), POLL_MS);
        }
      } catch (error) {
        if (cancelled) return;
        setFailure(
          error instanceof CheckoutError
            ? error.message
            : 'We could not confirm the payment. Please refresh this page.'
        );
        // Network hiccups are expected on mobile data; keep trying quietly.
        if (
          tries < MAX_ATTEMPTS &&
          (!(error instanceof CheckoutError) || error.code === 'NETWORK')
        ) {
          tries += 1;
          setAttempts(tries);
          timer.current = setTimeout(() => void poll(), POLL_MS * 2);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reference]);

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

  if (!reference) {
    return (
      <div className="success-card">
        <div className="status-dot">!</div>
        <h1>We lost track of that order</h1>
        <p className="lede">
          The confirmation link has no order reference. If you have already paid, reply to your
          Paystack receipt and we will send the key.
        </p>
        <div className="success-actions">
          <a className="btn btn-primary" href="/checkout">
            Start again
          </a>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="success-card">
        <div className="spinner" aria-hidden="true" />
        <h1>Confirming your payment…</h1>
        <p className="lede">This usually takes a few seconds. Please keep this page open.</p>
        {failure ? <div className="alert">{failure}</div> : null}
      </div>
    );
  }

  if (order.status === 'failed') {
    return (
      <div className="success-card">
        <div className="status-dot">!</div>
        <h1>That payment did not complete</h1>
        <p className="lede">
          Paystack reported a problem with the charge for {order.business}. No licence was issued.
          You can try again with the same or a different payment method.
        </p>
        <div className="success-actions">
          <a className="btn btn-primary" href="/checkout">
            Try again
          </a>
        </div>
      </div>
    );
  }

  if (order.status === 'pending') {
    const waitingTooLong = attempts >= MAX_ATTEMPTS;
    return (
      <div className="success-card">
        {waitingTooLong ? (
          <div className="status-dot">⏳</div>
        ) : (
          <div className="spinner" aria-hidden="true" />
        )}
        <h1>{waitingTooLong ? 'Payment still pending' : 'Waiting for Paystack…'}</h1>
        <p className="lede">
          {waitingTooLong
            ? 'Paystack has not confirmed this payment yet. If money has left your account, keep this reference and contact support — the key will be issued automatically once the payment lands.'
            : 'We are waiting for Paystack to confirm the payment. Your key appears here automatically.'}
        </p>
        <div className="summary-lines" style={{ textAlign: 'left' }}>
          <div className="summary-line">
            <span>Order reference</span>
            <strong style={{ wordBreak: 'break-all' }}>{order.reference}</strong>
          </div>
          <div className="summary-line">
            <span>Plan</span>
            <strong>{order.planName}</strong>
          </div>
          <div className="summary-line">
            <span>Amount</span>
            <strong>{formatNaira(order.amountKobo)}</strong>
          </div>
        </div>
        {failure ? <div className="alert">{failure}</div> : null}
      </div>
    );
  }

  const licenceDays = findLicensePlan(order.planId)?.days ?? 365;
  const issuedAt = new Date(order.paidAt ?? order.createdAt);
  const expiresOn = new Date(issuedAt.getTime() + licenceDays * 24 * 60 * 60 * 1000).toISOString();
  const delivered: string[] = [];
  if (order.delivery?.email?.state === 'sent') delivered.push(`email to ${order.email}`);
  if (order.delivery?.whatsapp?.state === 'sent') delivered.push('WhatsApp');

  return (
    <div className="success-card">
      <div className="status-dot">✓</div>
      <h1>Payment received — your licence is ready</h1>
      <p className="lede">
        {order.planName} licence for <strong>{order.business}</strong>, valid until{' '}
        {formatDate(expiresOn)}. Copy the key somewhere safe, then download the installer below. A
        copy of this key stays on your order page.
      </p>

      <div className="key-box">
        <label htmlFor="license-key">Licence key</label>
        <textarea id="license-key" readOnly value={order.licenseKey ?? ''} />
      </div>

      <div className="success-actions" style={{ marginTop: 0 }}>
        <button className="btn btn-primary" type="button" onClick={() => void copyKey()}>
          {copied ? 'Copied' : 'Copy licence key'}
        </button>
      </div>

      <p className="fine-print">
        {delivered.length > 0
          ? `A copy of this key was sent by ${delivered.join(' and ')}. `
          : null}
        You can always recover it at{' '}
        <a href="/retrieve-key">the key retrieval page</a> with this reference and your checkout
        email.
      </p>

      <div className="download-box">
        <h2>Download the app</h2>
        <p>
          Installer for Windows 10/11. Install it on the shop computer, then activate the key above
          under Settings → Licence.
        </p>
        <div className="success-actions">
          <a className="btn btn-primary" href={downloadUrl()}>
            Download AnalytIQ installer
          </a>
          <a
            className="btn btn-outline"
            href={whatsappUrl(
              `Hi AnalytIQ, I just bought the ${order.planName} plan for ${order.business}. Please help me install it.`
            )}
            target="_blank"
            rel="noreferrer"
          >
            Installation help on WhatsApp
          </a>
        </div>
      </div>

      <ol className="steps">
        <li>
          Download the installer above and install AnalytIQ on the shop computer (Windows will show
          &ldquo;More info → Run anyway&rdquo;).
        </li>
        <li>Open AnalytIQ and finish the short setup wizard.</li>
        <li>Go to Settings → Licence.</li>
        <li>Paste the key and choose Activate. Activation works offline.</li>
        <li>
          Keep the key with your records. To move computers later, deactivate on the old one first.
        </li>
      </ol>

      {failure ? (
        <div className="alert" style={{ marginTop: 20 }}>
          {failure}
        </div>
      ) : null}
    </div>
  );
}
