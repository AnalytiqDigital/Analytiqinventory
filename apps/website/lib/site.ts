export const SUPPORT_WHATSAPP = '2348124314217';
export const SUPPORT_WHATSAPP_LABEL = '+234 812 431 4217';
export const DOWNLOAD_FALLBACK_PATH = '/download';
export const INSTALLER_VERSION = '1.2.0';
export const DEFAULT_INSTALLER_URL = `https://github.com/AnalytiqDigital/analytiq-downloads/releases/download/v${INSTALLER_VERSION}/AnalytIQ-Inventory-${INSTALLER_VERSION}-Windows.zip`;
export const INSTALLER_SHA256 =
  '9dcaa5e06d9136b9f5a85404eb6ef8974263f9c53f009da8d93b6afe3f7d3bb6';
export const INSTALLER_SIZE_LABEL = '95 MB';

/** YouTube video id (the part after watch?v=). Empty until the tutorial is uploaded. */
export const TUTORIAL_YOUTUBE_ID = '';

export function whatsappUrl(message?: string): string {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP?.trim();
  const digits = (configured ?? '').replace(/\D/g, '');
  const number = digits.length > 0 ? digits : SUPPORT_WHATSAPP;
  const base = `https://wa.me/${number}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

// Env values are typed by hand in hosting dashboards; a stray "=" or a
// non-URL value must never become a broken href.
function usableDownloadTarget(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw === DOWNLOAD_FALLBACK_PATH || raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

export function downloadUrl(): string {
  return usableDownloadTarget(process.env.NEXT_PUBLIC_DOWNLOAD_URL) ?? DEFAULT_INSTALLER_URL;
}

export function isInstallerHosted(): boolean {
  return downloadUrl() !== DOWNLOAD_FALLBACK_PATH;
}
