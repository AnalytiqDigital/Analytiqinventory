'use client';

import { useState, type FormEvent } from 'react';
import { submitLead } from '../lib/api';
import { BUSINESS_TYPES, BRANCH_COUNTS, TILL_COUNTS, buildDemoMessage } from '../lib/demo';
import { whatsappUrl } from '../lib/site';

export function DemoRequest() {
  const [values, setValues] = useState({
    name: '',
    business: '',
    businessType: '',
    tills: '',
    branches: '',
    phone: '',
    email: '',
  });

  function update(field: keyof typeof values, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitLead({
      kind: 'demo',
      name: values.name,
      business: values.business,
      businessType: values.businessType,
      phone: values.phone,
      email: values.email,
      tills: values.tills,
      branches: values.branches,
      locations: '',
      notes: '',
    }).catch(() => undefined);
    window.open(whatsappUrl(buildDemoMessage(values)), '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <form className="demo-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="demo-name">
          Your name
        </label>
        <input
          id="demo-name"
          name="name"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
        />
        <label className="sr-only" htmlFor="demo-business">
          Business name
        </label>
        <input
          id="demo-business"
          name="business"
          value={values.business}
          onChange={(event) => update('business', event.target.value)}
          placeholder="Business name"
          autoComplete="organization"
        />
        <label className="sr-only" htmlFor="demo-type">
          Business type
        </label>
        <select
          id="demo-type"
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
        <label className="sr-only" htmlFor="demo-tills">
          Number of tills
        </label>
        <select
          id="demo-tills"
          name="tills"
          value={values.tills}
          onChange={(event) => update('tills', event.target.value)}
        >
          <option value="">Number of tills</option>
          {TILL_COUNTS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="demo-branches">
          Number of locations
        </label>
        <select
          id="demo-branches"
          name="branches"
          value={values.branches}
          onChange={(event) => update('branches', event.target.value)}
        >
          <option value="">Number of locations</option>
          {BRANCH_COUNTS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="demo-phone">
          Your phone or WhatsApp number
        </label>
        <input
          id="demo-phone"
          name="phone"
          value={values.phone}
          onChange={(event) => update('phone', event.target.value)}
          placeholder="Phone / WhatsApp number"
          autoComplete="tel"
          inputMode="tel"
          required
        />
        <label className="sr-only" htmlFor="demo-email">
          Your email
        </label>
        <input
          id="demo-email"
          name="email"
          type="email"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          placeholder="Email (optional)"
          autoComplete="email"
        />
        <button className="btn btn-primary" type="submit">
          Book a free demo
        </button>
      </form>
      <p className="demo-next">
        What happens next: the details open in WhatsApp, ready to send. We reply during working
        hours (West Africa Time) to arrange a 20-minute walkthrough with you.
      </p>
    </>
  );
}
