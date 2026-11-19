export const SUPPORT_WHATSAPP = '2348124314217';
export const SUPPORT_WHATSAPP_LABEL = '+234 812 431 4217';
export const DOWNLOAD_FALLBACK_PATH = '/download';
export const INSTALLER_VERSION = '1.1.0';
export const DEFAULT_INSTALLER_URL = `https://github.com/AnalytiqDigital/analytiq-downloads/releases/download/v${INSTALLER_VERSION}/AnalytIQ-Inventory-${INSTALLER_VERSION}-Windows.zip`;
export const INSTALLER_SHA256 = '1c7fb812119168895294c62af0940bb9bfcdc80ee42c3bf86cf4de8a4812a7fd';
export const INSTALLER_SIZE_LABEL = '95 MB';

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
