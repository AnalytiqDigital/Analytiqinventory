import type { LicenseStatus } from '../types/global';

export const RENEWAL_WARNING_DAYS = 7;
export const RENEW_URL = 'https://analytiq-inventory.vercel.app/checkout';
export const RETRIEVE_KEY_URL = 'https://analytiq-inventory.vercel.app/retrieve-key';

export interface RenewalNotice {
  title: string;
  body: string;
  action: string;
}

function days(count: number): string {
  return `${count} day${count === 1 ? '' : 's'}`;
}

/**
 * The warning shown in the shell and on the licence page. Null when the
 * licence is perpetual, comfortable, expired or invalid.
 */
export function renewalNotice(
  status: LicenseStatus,
  withinDays = RENEWAL_WARNING_DAYS
): RenewalNotice | null {
  if (status.daysLeft === null || status.daysLeft > withinDays) return null;
  if (status.state === 'active') {
    return {
      title:
        status.daysLeft === 0
          ? 'Your licence expires today'
          : `Your licence expires in ${days(status.daysLeft)}`,
      body: 'Renew now so selling is not interrupted. Your records stay on this computer.',
      action: 'Renew licence',
    };
  }
  if (status.state === 'trial') {
    return {
      title:
        status.daysLeft === 0
          ? 'Your free trial ends today'
          : `Your free trial ends in ${days(status.daysLeft)}`,
      body: 'Buy a licence key to keep recording sales and stock after the trial.',
      action: 'Buy a licence',
    };
  }
  return null;
}
