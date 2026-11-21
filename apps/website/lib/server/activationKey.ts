import {
  verifyLicenseKey,
  type LicensePayload,
} from '@analytiq/licensing/dist/key';
import { LICENSE_PUBLIC_KEY } from '@analytiq/licensing/dist/publicKey';

const DAY_MS = 86_400_000;

export type KeyCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; status: number; message: string; code: string };

/** Signature and expiry only; device binding is handled by the registry. */
export function checkActivationKey(rawKey: string, now = Date.now()): KeyCheck {
  const publicKey = process.env.LICENSE_PUBLIC_KEY?.trim() || LICENSE_PUBLIC_KEY;
  const check = verifyLicenseKey(rawKey, publicKey);
  if (!check.valid || !check.payload) {
    return {
      ok: false,
      status: 400,
      message: check.reason ?? 'This is not an AnalytIQ licence key',
      code: 'LICENSE_INVALID',
    };
  }
  const payload = check.payload;
  const expires = payload.expires ? Date.parse(payload.expires) : NaN;
  if (Number.isFinite(expires) && now > expires + DAY_MS) {
    return {
      ok: false,
      status: 403,
      message: 'This licence key has expired',
      code: 'LICENSE_EXPIRED',
    };
  }
  return { ok: true, payload };
}
