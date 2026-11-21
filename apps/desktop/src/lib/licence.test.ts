import { describe, expect, it } from 'vitest';
import type { LicenseStatus } from '../types/global';
import { RENEWAL_WARNING_DAYS, renewalNotice } from './licence';

function status(overrides: Partial<LicenseStatus>): LicenseStatus {
  return {
    state: 'active',
    reason: null,
    plan: 'standard',
    business: 'Ada Stores',
    licenseId: 'lic_1',
    expiresAt: '2027-11-18',
    daysLeft: 30,
    trialEndsAt: null,
    installId: 'install-1',
    usable: true,
    ...overrides,
  };
}

describe('renewalNotice', () => {
  it('stays quiet until the final week', () => {
    expect(RENEWAL_WARNING_DAYS).toBe(7);
    expect(renewalNotice(status({ daysLeft: 8 }))).toBeNull();
  });

  it('warns seven days before a paid licence expires', () => {
    expect(renewalNotice(status({ daysLeft: 7 }))).toMatchObject({
      title: 'Your licence expires in 7 days',
      action: 'Renew licence',
    });
    expect(renewalNotice(status({ daysLeft: 1 }))?.title).toBe(
      'Your licence expires in 1 day'
    );
    expect(renewalNotice(status({ daysLeft: 0 }))?.title).toBe('Your licence expires today');
  });

  it('nudges with a buy action while the trial is ending', () => {
    expect(renewalNotice(status({ state: 'trial', daysLeft: 3 }))).toMatchObject({
      title: 'Your free trial ends in 3 days',
      action: 'Buy a licence',
    });
  });

  it('ignores perpetual, expired and invalid licences', () => {
    expect(renewalNotice(status({ daysLeft: null }))).toBeNull();
    expect(renewalNotice(status({ state: 'expired', daysLeft: 0 }))).toBeNull();
    expect(renewalNotice(status({ state: 'invalid', daysLeft: 0 }))).toBeNull();
  });
});
