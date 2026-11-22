// Offline license keys for AnalytIQ.
//
// A key is `ANQ1.<payload>.<signature>` where payload and signature are
// base64url Ed25519. The payload names the business, plan, optional expiry and
// optional install binding. The desktop app and LAN server embed only the
// PUBLIC key, so keys can be issued from an offline machine (or the vendor's
// cloud issuer) and verified anywhere without a network call.
//
// Trial and activation state live in `schema_meta` (a global key/value table),
// so they survive logins, business renames and restores of business data.
//
// Signing and verification live in `./key` and have no database dependency, so
// the cloud API can import them without pulling in better-sqlite3.

import { randomBytes } from 'node:crypto';
import { writeAuditSync, type LocalDb } from '@analytiq/database';
import { LICENSE_PUBLIC_KEY } from './publicKey';
import { verifyLicenseKey, type LicensePayload } from './key';

export * from './key';
export { LICENSE_PUBLIC_KEY } from './publicKey';

export const TRIAL_DAYS = 14;

const META_KEY = 'license.key';
const META_ACTIVATED = 'license.activated_at';
const META_TRIAL = 'license.trial_started';
const META_INSTALL = 'license.install_id';

const DAY_MS = 86_400_000;

export type LicenseState = 'active' | 'trial' | 'expired' | 'invalid' | 'unlicensed';

export interface LicenseStatus {
  state: LicenseState;
  /** Why the license is not active (human readable). */
  reason: string | null;
  plan: string | null;
  business: string | null;
  licenseId: string | null;
  expiresAt: string | null;
  /** Days until expiry; null for a perpetual license. */
  daysLeft: number | null;
  trialEndsAt: string | null;
  /** Stable id for this installation; shown so a key can be device-bound. */
  installId: string;
  /** True while business features are usable. */
  usable: boolean;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export function readMeta(local: LocalDb, key: string): string | null {
  const row = local.raw.prepare('SELECT value FROM schema_meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function writeMeta(local: LocalDb, key: string, value: string): void {
  local.raw
    .prepare(
      `INSERT INTO schema_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, Math.floor(Date.now() / 1000));
}

/** Random, stable per-installation id. Created on first use and persisted. */
export function getInstallId(local: LocalDb): string {
  const existing = readMeta(local, META_INSTALL);
  if (existing) return existing;
  const created = randomBytes(16).toString('hex');
  writeMeta(local, META_INSTALL, created);
  return created;
}

function expiryMs(payload: LicensePayload): number | null {
  if (!payload.expires) return null;
  const parsed = Date.parse(payload.expires);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A date-only licence is valid through the end of that day (UTC). */
function expired(payload: LicensePayload, now: Date): boolean {
  const end = expiryMs(payload);
  if (end === null) return false;
  return now.getTime() > end + DAY_MS;
}

function daysBetween(endMs: number, now: Date): number {
  return Math.max(0, Math.ceil((endMs - now.getTime()) / DAY_MS));
}

function invalidStatus(installId: string, reason: string, payload?: LicensePayload): LicenseStatus {
  return {
    state: 'invalid',
    reason,
    plan: payload?.plan ?? null,
    business: payload?.business ?? null,
    licenseId: payload?.id ?? null,
    expiresAt: payload?.expires ?? null,
    daysLeft: null,
    trialEndsAt: null,
    installId,
    usable: false,
  };
}

export interface StatusOptions {
  /** Verify against a different public key (tests / white-label builds). */
  publicKey?: string;
  now?: Date;
  /** Who performed an activation; recorded in the audit log when present. */
  actor?: { userId: string; businessId: string };
}

export function getLicenseStatus(local: LocalDb, options: StatusOptions = {}): LicenseStatus {
  const now = options.now ?? new Date();
  const installId = getInstallId(local);
  const rawKey = readMeta(local, META_KEY);

  if (rawKey) {
    const check = verifyLicenseKey(rawKey, options.publicKey ?? LICENSE_PUBLIC_KEY);
    if (!check.valid || !check.payload) {
      return invalidStatus(installId, check.reason ?? 'License key is not valid');
    }
    const payload = check.payload;
    if (payload.device && payload.device !== installId) {
      return invalidStatus(installId, 'This key was issued for a different installation', payload);
    }
    if (expired(payload, now)) {
      return {
        ...invalidStatus(installId, 'The license key has expired', payload),
        state: 'expired',
        daysLeft: 0,
      };
    }
    const end = expiryMs(payload);
    return {
      state: 'active',
      reason: null,
      plan: payload.plan,
      business: payload.business,
      licenseId: payload.id,
      expiresAt: payload.expires,
      daysLeft: end === null ? null : daysBetween(end, now),
      trialEndsAt: null,
      installId,
      usable: true,
    };
  }

  let started = readMeta(local, META_TRIAL);
  if (!started || !Number.isFinite(Date.parse(started))) {
    started = now.toISOString();
    writeMeta(local, META_TRIAL, started);
  }
  const trialEndMs = Date.parse(started) + TRIAL_DAYS * DAY_MS;
  const trialEndsAt = new Date(trialEndMs).toISOString();
  if (now.getTime() >= trialEndMs) {
    return {
      state: 'expired',
      reason: `The ${TRIAL_DAYS}-day trial has ended`,
      plan: null,
      business: null,
      licenseId: null,
      expiresAt: null,
      daysLeft: 0,
      trialEndsAt,
      installId,
      usable: false,
    };
  }
  return {
    state: 'trial',
    reason: null,
    plan: null,
    business: null,
    licenseId: null,
    expiresAt: null,
    daysLeft: daysBetween(trialEndMs, now),
    trialEndsAt,
    installId,
    usable: true,
  };
}

/**
 * Validate and persist a key. Throws coded errors:
 * `LICENSE_INVALID`, `LICENSE_DEVICE_MISMATCH`, `LICENSE_EXPIRED`.
 */
export function activateLicense(
  local: LocalDb,
  rawKey: string,
  options: StatusOptions = {}
): LicenseStatus {
  const now = options.now ?? new Date();
  const installId = getInstallId(local);
  const check = verifyLicenseKey(rawKey, options.publicKey ?? LICENSE_PUBLIC_KEY);
  if (!check.valid || !check.payload) {
    throw codedError(check.reason ?? 'License key is not valid', 'LICENSE_INVALID');
  }
  if (check.payload.device && check.payload.device !== installId) {
    throw codedError('This key was issued for a different installation', 'LICENSE_DEVICE_MISMATCH');
  }
  if (expired(check.payload, now)) {
    throw codedError('The license key has expired', 'LICENSE_EXPIRED');
  }
  writeMeta(local, META_KEY, rawKey.trim());
  writeMeta(local, META_ACTIVATED, now.toISOString());
  if (options.actor) {
    writeAuditSync(local, {
      businessId: options.actor.businessId,
      userId: options.actor.userId,
      action: 'license.activated',
      entity: 'license',
      entityId: check.payload.id,
      details: { plan: check.payload.plan, expires: check.payload.expires },
    });
  }
  return getLicenseStatus(local, options);
}

/** Remove the stored key. Used by support; the trial is not restarted. */
export function deactivateLicense(local: LocalDb): void {
  local.raw.prepare('DELETE FROM schema_meta WHERE key = ?').run(META_KEY);
}

/**
 * One key, one computer. Keys issued without a device are bound to the first
 * installation that activates them (recorded by the licence registry), so the
 * same key cannot license a second machine. The registry call happens once;
 * the key then works offline. Keys already bound to a device at issue time
 * skip the network entirely.
 */
export const ACTIVATION_SERVER = 'https://analytiq-inventory.vercel.app';

const ACTIVATION_OFFLINE_MESSAGE =
  'Cannot reach the AnalytIQ activation server. Connect to the internet and try again — a licence key can only be used on one computer.';
const ACTIVATION_UNAVAILABLE_MESSAGE =
  'Activation is temporarily unavailable. Try again in a moment or contact AnalytIQ support.';
const LICENSE_IN_USE_MESSAGE =
  'This licence key is already activated on another computer. Deactivate it there first, or contact AnalytIQ support.';

export interface ActivationNetworkOptions extends StatusOptions {
  /** Website origin that runs /api/licence/activate. */
  serverUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function messageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { error?: unknown }).error;
  return typeof value === 'string' && value.trim() ? value : null;
}

function codeOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { code?: unknown }).code;
  return typeof value === 'string' && value.trim() ? value : null;
}

async function postActivation(
  path: string,
  payload: Record<string, unknown>,
  options: ActivationNetworkOptions
): Promise<Response> {
  const base = (
    options.serverUrl ??
    process.env.ANALYTIQ_ACTIVATION_URL ??
    ACTIVATION_SERVER
  ).replace(/\/+$/, '');
  try {
    return await (options.fetchImpl ?? fetch)(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch {
    throw codedError(ACTIVATION_OFFLINE_MESSAGE, 'ACTIVATION_OFFLINE');
  }
}

async function refusal(response: Response): Promise<never> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON bodies fall through to the generic messages below.
  }
  const code = codeOf(body);
  if (code === 'LICENSE_IN_USE' || (response.status === 409 && code === null)) {
    throw codedError(messageOf(body) ?? LICENSE_IN_USE_MESSAGE, 'LICENSE_IN_USE');
  }
  if (code === 'LICENSE_EXPIRED' || code === 'LICENSE_DEVICE_MISMATCH' || code === 'LICENSE_INVALID') {
    throw codedError(messageOf(body) ?? 'That license key could not be activated', code);
  }
  throw codedError(messageOf(body) ?? ACTIVATION_UNAVAILABLE_MESSAGE, 'ACTIVATION_UNAVAILABLE');
}

export async function activateLicenseOnline(
  local: LocalDb,
  rawKey: string,
  options: ActivationNetworkOptions = {}
): Promise<LicenseStatus> {
  const now = options.now ?? new Date();
  const key = rawKey.trim();
  const check = verifyLicenseKey(key, options.publicKey ?? LICENSE_PUBLIC_KEY);
  if (!check.valid || !check.payload) {
    throw codedError(check.reason ?? 'License key is not valid', 'LICENSE_INVALID');
  }
  if (check.payload.device) return activateLicense(local, key, options);
  if (expired(check.payload, now)) {
    throw codedError('The license key has expired', 'LICENSE_EXPIRED');
  }

  const response = await postActivation(
    '/api/licence/activate',
    { key, installId: getInstallId(local) },
    options
  );
  if (!response.ok) await refusal(response);
  return activateLicense(local, key, options);
}

export async function deactivateLicenseOnline(
  local: LocalDb,
  options: ActivationNetworkOptions = {}
): Promise<void> {
  const rawKey = readMeta(local, META_KEY);
  if (!rawKey) {
    deactivateLicense(local);
    return;
  }
  const check = verifyLicenseKey(rawKey, options.publicKey ?? LICENSE_PUBLIC_KEY);
  if (!check.valid || !check.payload || check.payload.device) {
    deactivateLicense(local);
    return;
  }

  const response = await postActivation(
    '/api/licence/deactivate',
    { key: rawKey.trim(), installId: getInstallId(local) },
    options
  );
  if (!response.ok) await refusal(response);
  deactivateLicense(local);
}
