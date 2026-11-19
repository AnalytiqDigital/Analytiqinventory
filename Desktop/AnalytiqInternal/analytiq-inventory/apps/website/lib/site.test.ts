import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTALLER_URL,
  DOWNLOAD_FALLBACK_PATH,
  SUPPORT_WHATSAPP,
  downloadUrl,
  isInstallerHosted,
  whatsappUrl,
} from './site';

const original = {
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP,
  download: process.env.NEXT_PUBLIC_DOWNLOAD_URL,
};

afterEach(() => {
  if (original.whatsapp === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP;
  else process.env.NEXT_PUBLIC_WHATSAPP = original.whatsapp;
  if (original.download === undefined) delete process.env.NEXT_PUBLIC_DOWNLOAD_URL;
  else process.env.NEXT_PUBLIC_DOWNLOAD_URL = original.download;
});

describe('whatsappUrl', () => {
  it('defaults to the support number from the landing page', () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP;
    expect(whatsappUrl()).toBe(`https://wa.me/${SUPPORT_WHATSAPP}`);
    expect(SUPPORT_WHATSAPP).toBe('2348124314217');
  });

  it('encodes the prefilled message', () => {
    delete process.env.NEXT_PUBLIC_WHATSAPP;
    expect(whatsappUrl('I need help')).toBe(
      `https://wa.me/${SUPPORT_WHATSAPP}?text=I%20need%20help`
    );
  });

  it('strips punctuation from an override number', () => {
    process.env.NEXT_PUBLIC_WHATSAPP = '+234 800 000 0000';
    expect(whatsappUrl()).toBe('https://wa.me/2348000000000');
  });
});

describe('downloadUrl', () => {
  it('defaults to the public GitHub release when no host is configured', () => {
    delete process.env.NEXT_PUBLIC_DOWNLOAD_URL;
    expect(downloadUrl()).toBe(DEFAULT_INSTALLER_URL);
    expect(DEFAULT_INSTALLER_URL).toContain('analytiq-downloads/releases/download/v1.1.0/');
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
});
