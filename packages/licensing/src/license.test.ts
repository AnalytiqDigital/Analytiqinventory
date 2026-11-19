import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeLocalDb, openLocalDb, runMigrations, type LocalDb } from '@analytiq/database';
import {
  activateLicense,
  deactivateLicense,
  getInstallId,
  getLicenseStatus,
  issueLicense,
  TRIAL_DAYS,
  verifyLicenseKey,
} from './index';

const DAY = 86_400_000;

describe('offline license keys', () => {
  let dir: string;
  let local: LocalDb;
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'analytiq-license-'));
    const file = join(dir, 'local.db');
    runMigrations(file);
    local = openLocalDb(file);
    const pair = generateKeyPairSync('ed25519');
    privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  });

  afterEach(() => {
    closeLocalDb(local);
  });

  function issue(days = 0, device: string | null = null, now = new Date()) {
    return issueLicense({
      business: 'Ada Stores',
      plan: 'standard',
      days,
      device,
      privateKeyPem,
      now,
    });
  }

  it('issues keys that verify with the matching public key', () => {
    const { key, payload } = issue(365);
    expect(key.startsWith('ANQ1.')).toBe(true);
    expect(payload.business).toBe('Ada Stores');

    const check = verifyLicenseKey(key, publicKeyPem);
    expect(check.valid).toBe(true);
    expect(check.payload?.plan).toBe('standard');
    expect(check.payload?.device).toBeNull();
  });

  it('rejects tampered keys and the wrong public key', () => {
    const { key } = issue(365);
    const [prefix, , signature] = key.split('.');
    const real = verifyLicenseKey(key, publicKeyPem).payload;
    const forged = Buffer.from(JSON.stringify({ ...real, business: 'Pirate Ltd' }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(verifyLicenseKey(`${prefix}.${forged}.${signature}`, publicKeyPem).valid).toBe(false);
    expect(verifyLicenseKey(key, '').valid).toBe(false);
    expect(verifyLicenseKey('not-a-key', publicKeyPem).valid).toBe(false);
    const otherKey = generateKeyPairSync('ed25519')
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    expect(verifyLicenseKey(key, otherKey).valid).toBe(false);
  });

  it('activates a perpetual key and exposes it in the status', () => {
    const { key } = issue();
    const status = activateLicense(local, key, { publicKey: publicKeyPem });
    expect(status.state).toBe('active');
    expect(status.usable).toBe(true);
    expect(status.plan).toBe('standard');
    expect(status.business).toBe('Ada Stores');
    expect(status.expiresAt).toBeNull();
    expect(status.daysLeft).toBeNull();

    const again = getLicenseStatus(local, { publicKey: publicKeyPem });
    expect(again.state).toBe('active');
    expect(again.installId).toBe(status.installId);
  });

  it('refuses expired and device-bound keys', () => {
    const expired = issue(1, null, new Date(Date.now() - 10 * DAY));
    expect(() => activateLicense(local, expired.key, { publicKey: publicKeyPem })).toThrow(
      /expired/i
    );

    const otherDevice = issue(30, 'someone-elses-install');
    expect(() => activateLicense(local, otherDevice.key, { publicKey: publicKeyPem })).toThrow(
      /different installation/i
    );

    const ownDevice = issue(30, getInstallId(local));
    const status = activateLicense(local, ownDevice.key, { publicKey: publicKeyPem });
    expect(status.state).toBe('active');
    expect(status.daysLeft).toBeGreaterThan(0);
  });

  it('rejects an invalid key with a coded error', () => {
    expect(() =>
      activateLicense(local, 'ANQ1.garbage.garbage', { publicKey: publicKeyPem })
    ).toThrow(/not valid|could not|incomplete/i);
    let caught: { code?: string } | null = null;
    try {
      activateLicense(local, 'ANQ1.garbage.garbage', { publicKey: publicKeyPem });
    } catch (err) {
      caught = err as { code?: string };
    }
    expect(caught?.code).toBe('LICENSE_INVALID');
  });

  it('runs a 14-day trial, then expires until activation', () => {
    const start = new Date('2026-01-01T09:00:00.000Z');
    const dayOne = getLicenseStatus(local, { publicKey: publicKeyPem, now: start });
    expect(dayOne.state).toBe('trial');
    expect(dayOne.daysLeft).toBe(TRIAL_DAYS);

    const later = getLicenseStatus(local, {
      publicKey: publicKeyPem,
      now: new Date(start.getTime() + 5 * DAY),
    });
    expect(later.state).toBe('trial');
    expect(later.daysLeft).toBe(TRIAL_DAYS - 5);

    const over = getLicenseStatus(local, {
      publicKey: publicKeyPem,
      now: new Date(start.getTime() + (TRIAL_DAYS + 1) * DAY),
    });
    expect(over.state).toBe('expired');
    expect(over.usable).toBe(false);

    const { key } = issue();
    const activated = activateLicense(local, key, { publicKey: publicKeyPem });
    expect(activated.state).toBe('active');

    deactivateLicense(local);
    const after = getLicenseStatus(local, {
      publicKey: publicKeyPem,
      now: new Date(start.getTime() + (TRIAL_DAYS + 1) * DAY),
    });
    expect(after.state).toBe('expired');
  });

  it('reports an invalid state when the stored key cannot be verified', () => {
    local.raw
      .prepare("INSERT INTO schema_meta (key, value, updated_at) VALUES ('license.key', ?, 0)")
      .run(issue().key);

    const status = getLicenseStatus(local, { publicKey: '' });
    expect(status.state).toBe('invalid');
    expect(status.usable).toBe(false);
    expect(status.reason).toMatch(/no license key configured/i);
  });
});
