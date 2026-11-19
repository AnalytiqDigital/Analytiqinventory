'use client';

import { useState, type FormEvent } from 'react';
import { whatsappUrl } from '../lib/site';

export function DemoRequest() {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const details = [
      phone.trim() ? `Phone: ${phone.trim()}` : '',
      email.trim() ? `Email: ${email.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const message = details
      ? `Hi AnalytIQ, I would like a free demo.\n${details}`
      : 'Hi AnalytIQ, I would like a free demo.';
    window.open(whatsappUrl(message), '_blank', 'noopener,noreferrer');
  }

  return (
    <form className="demo-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="demo-phone">
        Your phone or WhatsApp number
      </label>
      <input
        id="demo-phone"
        name="phone"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="Your phone / WhatsApp"
        autoComplete="tel"
        inputMode="tel"
      />
      <label className="sr-only" htmlFor="demo-email">
        Your email
      </label>
      <input
        id="demo-email"
        name="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email"
        autoComplete="email"
      />
      <button className="btn btn-primary" type="submit">
        Book a free demo
      </button>
    </form>
  );
}
