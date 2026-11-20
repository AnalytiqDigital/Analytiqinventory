'use client';

import { useState, type FormEvent } from 'react';
import { BUSINESS_TYPES } from '../lib/demo';
import { LOCATION_COUNTS, TILLS_PER_LOCATION, buildQuoteMessage } from '../lib/quote';
import { whatsappUrl } from '../lib/site';

export function QuoteRequest() {
  const [values, setValues] = useState({
    business: '',
    name: '',
    businessType: '',
    locations: '',
    tills: '',
    phone: '',
    email: '',
    notes: '',
  });

  function update(field: keyof typeof values, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    window.open(whatsappUrl(buildQuoteMessage(values)), '_blank', 'noopener,noreferrer');
  }

  return (
    <form className="demo-form quote-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="quote-business">
        Business name
      </label>
      <input
        id="quote-business"
        name="business"
        value={values.business}
        onChange={(event) => update('business', event.target.value)}
        placeholder="Business name"
        autoComplete="organization"
        required
      />
      <label className="sr-only" htmlFor="quote-name">
        Your name
      </label>
      <input
        id="quote-name"
        name="name"
        value={values.name}
        onChange={(event) => update('name', event.target.value)}
        placeholder="Your name"
        autoComplete="name"
        required
      />
      <label className="sr-only" htmlFor="quote-type">
        Business type
      </label>
      <select
        id="quote-type"
        name="businessType"
        value={values.businessType}
        onChange={(event) => update('businessType', event.target.value)}
      >
        <option value="">Business type</option>
        {BUSINESS_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="quote-locations">
        Number of locations
      </label>
      <select
        id="quote-locations"
        name="locations"
        value={values.locations}
        onChange={(event) => update('locations', event.target.value)}
        required
      >
        <option value="">Number of locations</option>
        {LOCATION_COUNTS.map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="quote-tills">
        Tills per location
      </label>
      <select
        id="quote-tills"
        name="tills"
        value={values.tills}
        onChange={(event) => update('tills', event.target.value)}
      >
        <option value="">Tills per location</option>
        {TILLS_PER_LOCATION.map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="quote-phone">
        Your phone or WhatsApp number
      </label>
      <input
        id="quote-phone"
        name="phone"
        value={values.phone}
        onChange={(event) => update('phone', event.target.value)}
        placeholder="Phone / WhatsApp number"
        autoComplete="tel"
        inputMode="tel"
        required
      />
      <label className="sr-only" htmlFor="quote-email">
        Your email
      </label>
      <input
        id="quote-email"
        name="email"
        type="email"
        value={values.email}
        onChange={(event) => update('email', event.target.value)}
        placeholder="Email (optional)"
        autoComplete="email"
      />
      <label className="sr-only" htmlFor="quote-notes">
        Anything else we should know
      </label>
      <textarea
        id="quote-notes"
        name="notes"
        value={values.notes}
        onChange={(event) => update('notes', event.target.value)}
        placeholder="Anything else — how you track stock today, when you want to start…"
        rows={3}
      />
      <button className="btn btn-primary" type="submit">
        Send quote request on WhatsApp
      </button>
      <p className="demo-next">
        What happens next: the details open in WhatsApp, ready to send. We reply during working
        hours (West Africa Time) with a written quote.
      </p>
    </form>
  );
}
