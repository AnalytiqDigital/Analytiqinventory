// Pure Ed25519 license-key signing and verification.
//
// This module has no database dependency so it can run in the cloud issuer as
// well as in the offline CLI. The app itself only ever verifies; the private
// key must stay on vendor-controlled machines.

import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { LICENSE_PUBLIC_KEY } from './publicKey';

export const LICENSE_PREFIX = 'ANQ1';
export const LICENSE_VERSION = 1;

export interface LicensePayload {
  /** Payload version. */
  v: number;
  /** License id shown in the UI and used for support. */
  id: string;
  /** Business name the key was sold to. Display only. */
  business: string;
  /** `starter`, `standard`, `pro`, or any plan name agreed with the vendor. */
  plan: string;
  /** ISO date the key was issued. */
  issued: string;
  /** ISO date after which the key stops working; null = perpetual. */
  expires: string | null;
  /** Install id this key is bound to; null = any installation. */
  device: string | null;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  payload?: LicensePayload;
}

export interface IssueInput {
  business: string;
  plan?: string;
  /** Days until expiry; omitted or 0 = perpetual. */
  days?: number;
  /** Bind the key to an install id. Omit for any installation. */
  device?: string | null;
  /** PEM-encoded Ed25519 private key. */
  privateKeyPem: string;
  /** Override for deterministic tests. */
  now?: Date;
  id?: string;
}

export interface IssueResult {
  key: string;
  payload: LicensePayload;
}

const DAY_MS = 86_400_000;

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function b64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Buffer {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function parsePayload(text: string): LicensePayload | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.v !== LICENSE_VERSION) return null;
  if (typeof p.id !== 'string' || p.id.length === 0) return null;
  if (typeof p.business !== 'string' || p.business.length === 0) return null;
  if (typeof p.plan !== 'string' || p.plan.length === 0) return null;
  if (!isIsoDate(p.issued)) return null;
  if (p.expires !== null && !isIsoDate(p.expires)) return null;
  if (p.device !== null && (typeof p.device !== 'string' || p.device.length === 0)) return null;
  return {
    v: LICENSE_VERSION,
    id: p.id,
    business: p.business,
    plan: p.plan,
    issued: p.issued,
    expires: p.expires as string | null,
    device: p.device as string | null,
  };
}

/**
 * Sign a payload. Used by the vendor's issuing CLI and the cloud issuer; never
 * call this from the app itself — the private key must stay off customer
 * machines.
 */
export function issueLicense(input: IssueInput): IssueResult {
  const now = input.now ?? new Date();
  if (input.business.trim().length === 0)
    throw codedError('Business name is required', 'ISSUE_INVALID');
  const days = input.days ?? 0;
  if (days < 0) throw codedError('Days must be zero or more', 'ISSUE_INVALID');

  const payload: LicensePayload = {
    v: LICENSE_VERSION,
    id: input.id ?? `lic_${randomBytes(8).toString('hex')}`,
    business: input.business.trim(),
    plan: input.plan?.trim() || 'standard',
    issued: now.toISOString(),
    expires: days > 0 ? new Date(now.getTime() + days * DAY_MS).toISOString() : null,
    device: input.device?.trim() || null,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = createPrivateKey(input.privateKeyPem);
  const signature = sign(null, body, privateKey);
  return {
    key: `${LICENSE_PREFIX}.${b64url(body)}.${b64url(signature)}`,
    payload,
  };
}

/** Verify shape, signature and public key. Does not check device or expiry. */
export function verifyLicenseKey(
  rawKey: string,
  publicKeyPem: string = LICENSE_PUBLIC_KEY
): VerifyResult {
  if (!publicKeyPem || publicKeyPem.trim().length === 0) {
    return { valid: false, reason: 'This build has no license key configured' };
  }
  if (typeof rawKey !== 'string') return { valid: false, reason: 'License key is required' };
  const parts = rawKey.trim().split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return { valid: false, reason: 'This is not an AnalytIQ license key' };
  }
  const [, bodyText, signatureText] = parts;
  if (!bodyText || !signatureText) return { valid: false, reason: 'License key is incomplete' };

  const body = unb64url(bodyText);
  const signature = unb64url(signatureText);
  let ok = false;
  try {
    ok = verify(null, body, createPublicKey(publicKeyPem), signature);
  } catch {
    return { valid: false, reason: 'License key could not be verified' };
  }
  if (!ok) return { valid: false, reason: 'License signature is not valid' };

  const payload = parsePayload(body.toString('utf8'));
  if (!payload) return { valid: false, reason: 'License payload is not valid' };
  return { valid: true, payload };
}
