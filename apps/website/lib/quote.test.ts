import { describe, expect, it } from 'vitest';
import { buildQuoteMessage } from './quote';

describe('buildQuoteMessage', () => {
  it('opens with the cloud-version request when nothing is filled in', () => {
    expect(buildQuoteMessage({})).toBe(
      'Hi AnalytIQ, I would like a quote for the cloud version (more than one location).'
    );
    expect(buildQuoteMessage({ business: '  ', phone: '' })).toBe(
      'Hi AnalytIQ, I would like a quote for the cloud version (more than one location).'
    );
  });

  it('lists every answered field in a stable order', () => {
    const message = buildQuoteMessage({
      business: 'Ada Stores',
      name: 'Ada Obi',
      businessType: 'Supermarket',
      locations: '3–5 locations',
      tills: '3–5 tills per location',
      phone: '08012345678',
      email: 'ada@example.com',
      notes: 'We use Excel today.',
    });
    expect(message.split('\n')).toEqual([
      'Hi AnalytIQ, I would like a quote for the cloud version (more than one location).',
      'Business: Ada Stores',
      'Contact: Ada Obi',
      'Business type: Supermarket',
      'Locations: 3–5 locations',
      'Tills: 3–5 tills per location',
      'Phone: 08012345678',
      'Email: ada@example.com',
      'Notes: We use Excel today.',
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(buildQuoteMessage({ business: ' Ada Stores ', notes: ' Two branches ' })).toContain(
      'Business: Ada Stores'
    );
    expect(buildQuoteMessage({ notes: ' Two branches ' })).toContain('Notes: Two branches');
  });
});
