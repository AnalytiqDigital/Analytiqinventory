import { describe, expect, it } from 'vitest';
import { buildDemoMessage } from './demo';

describe('buildDemoMessage', () => {
  it('sends only the greeting when nothing is filled in', () => {
    expect(buildDemoMessage({})).toBe('Hi AnalytIQ, I would like a free demo.');
    expect(buildDemoMessage({ name: '   ', phone: '' })).toBe(
      'Hi AnalytIQ, I would like a free demo.'
    );
  });

  it('lists every answered field in a stable order', () => {
    const message = buildDemoMessage({
      name: 'Ada',
      business: 'Ada Stores',
      businessType: 'Provision store',
      tills: '2–3 tills',
      branches: '1 location',
      phone: '08012345678',
      email: 'ada@example.com',
    });
    expect(message.split('\n')).toEqual([
      'Hi AnalytIQ, I would like a free demo.',
      'Name: Ada',
      'Business: Ada Stores',
      'Business type: Provision store',
      'Tills: 2–3 tills',
      'Locations: 1 location',
      'Phone: 08012345678',
      'Email: ada@example.com',
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(buildDemoMessage({ name: ' Ada ' })).toContain('Name: Ada');
  });
});
