import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTALLER_URL,
  DOWNLOAD_FALLBACK_PATH,
  INSTALLER_VERSION,
  SUPPORT_PHONE,
  SUPPORT_WHATSAPP,
  callUrl,
  downloadUrl,
  isInstallerHosted,
  whatsappUrl,
} from './site';

const original = {
  download: process.env.NEXT_PUBLIC_DOWNLOAD_URL,
};

afterEach(() => {
  if (original.download === undefined) delete process.env.NEXT_PUBLIC_DOWNLOAD_URL;
  else process.env.NEXT_PUBLIC_DOWNLOAD_URL = original.download;
});

describe('whatsappUrl', () => {
  it('uses the published support number', () => {
    expect(whatsappUrl()).toBe(`https://wa.me/${SUPPORT_WHATSAPP}`);
    expect(SUPPORT_WHATSAPP).toBe('2348139711767');
  });

  it('encodes the prefilled message', () => {
    expect(whatsappUrl('I need help')).toBe(
      `https://wa.me/${SUPPORT_WHATSAPP}?text=I%20need%20help`
    );
  });
});

describe('callUrl', () => {
  it('dials the support line in international format', () => {
    expect(SUPPORT_PHONE).toBe('+2348124314217');
    expect(callUrl()).toBe('tel:+2348124314217');
  });
});

describe('downloadUrl', () => {
  it('defaults to the public GitHub release when no host is configured', () => {
    delete process.env.NEXT_PUBLIC_DOWNLOAD_URL;
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
    expect(DEFAULT_INSTALLER_URL).toContain(
      `analytiq-downloads/releases/download/v${INSTALLER_VERSION}/`
    );
    expect(isInstallerHosted()).toBe(true);
  });

  it('uses the configured installer URL', () => {
    process.env.NEXT_PUBLIC_DOWNLOAD_URL =
      'https://downloads.example.com/AnalytIQ-Inventory-Setup-1.1.0.exe';
    expect(downloadUrl()).toBe('https://downloads.example.com/AnalytIQ-Inventory-Setup-1.1.0.exe');
    expect(isInstallerHosted()).toBe(true);
  });

  it('treats a blank value as not configured', () => {
    process.env.NEXT_PUBLIC_DOWNLOAD_URL = '   ';
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
  });

  it('still allows switching back to the local download page', () => {
    process.env.NEXT_PUBLIC_DOWNLOAD_URL = DOWNLOAD_FALLBACK_PATH;
    expect(downloadUrl()).toBe(DOWNLOAD_FALLBACK_PATH);
    expect(isInstallerHosted()).toBe(false);
  });

  it('ignores a malformed override instead of rendering a broken link', () => {
    process.env.NEXT_PUBLIC_DOWNLOAD_URL = '=';
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
    process.env.NEXT_PUBLIC_DOWNLOAD_URL = 'not a url';
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
    process.env.NEXT_PUBLIC_DOWNLOAD_URL = 'javascript:alert(1)';
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
  });
});
