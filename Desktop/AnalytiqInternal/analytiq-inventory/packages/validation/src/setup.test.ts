import { describe, expect, it } from 'vitest';
import { loginSchema, setupSchema } from './index';

function validSetup() {
  return {
    business: {
      name: 'Test Mart',
      type: 'retail',
      address: '',
      state: 'Lagos',
      lga: 'Ikeja',
      phone: '+2348012345678',
      email: 'info@testmart.ng',
      currency: 'ngn',
      taxLabel: 'VAT',
      taxRateBps: 750,
    },
    location: { name: 'Main Store', address: '', state: 'Lagos', lga: 'Ikeja' },
    admin: { name: 'Ada', email: 'ada@testmart.ng', password: 'Admin1234' },
  };
}

describe('setup + login validation', () => {
  it('normalises currency to uppercase', () => {
    const parsed = setupSchema.parse(validSetup());
    expect(parsed.business.currency).toBe('NGN');
  });
  it('rejects weak passwords', () => {
    expect(() => setupSchema.parse({ ...validSetup(), admin: { name: 'A', email: 'a@b.ng', password: 'short' } })).toThrow();
  });
  it('rejects invalid login email', () => {
    expect(() => loginSchema.parse({ email: 'nope', password: 'x' })).toThrow();
  });
});
