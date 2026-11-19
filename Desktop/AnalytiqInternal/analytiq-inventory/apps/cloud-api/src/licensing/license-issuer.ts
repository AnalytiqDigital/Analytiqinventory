import { createPrivateKey } from 'node:crypto';
import { findLicensePlan } from '@analytiq/validation';
import { ApiError } from '../common/api-error';
import type { Order } from '../orders/order.store';

// Deep import: `@analytiq/licensing` also exposes database-backed trial state,
// and the cloud host must not load better-sqlite3. `dist/key` is pure crypto.
import { issueLicense } from '@analytiq/licensing/dist/key';

export class LicenseIssuer {
  constructor(
    private readonly privateKeyPem: string,
    private readonly fallbackDays: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  get configured(): boolean {
    return this.privateKeyPem.trim().length > 0;
  }

  /** Throws a 500-coded error when the deployment has no private key. */
  issue(order: Order): string {
    if (!this.configured) {
      throw new ApiError(
        500,
        'The license issuer has no private key configured',
        'LICENSE_KEY_MISSING'
      );
    }
    try {
      createPrivateKey(this.privateKeyPem);
    } catch {
      throw new ApiError(
        500,
        'The configured license private key is not valid',
        'LICENSE_KEY_INVALID'
      );
    }
    const days = findLicensePlan(order.planId)?.days ?? this.fallbackDays;
    return issueLicense({
      business: order.business,
      plan: order.planId,
      days,
      privateKeyPem: this.privateKeyPem,
      now: this.now(),
    }).key;
  }
}
