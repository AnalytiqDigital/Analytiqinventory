export const SUPPORT_WHATSAPP = '2348139711767';
export const SUPPORT_WHATSAPP_LABEL = '0813 971 1767';
export const SUPPORT_PHONE = '+2348124314217';
export const SUPPORT_PHONE_LABEL = '0812 431 4217';
export const SUPPORT_HOURS = 'Monday–Saturday, 9:00–18:00 WAT';
export const COMPANY_SITE = 'https://www.analytiq.ng';
export const COMPANY_SITE_LABEL = 'www.analytiq.ng';
export const DOWNLOAD_FALLBACK_PATH = '/download';
export const INSTALLER_VERSION = '1.3.1';
export const DEFAULT_INSTALLER_URL = `https://github.com/AnalytiqDigital/analytiq-downloads/releases/download/v${INSTALLER_VERSION}/AnalytIQ-Inventory-${INSTALLER_VERSION}-Windows.zip`;
export const INSTALLER_SHA256 = '1c45f0b237718d227784d5429da7fb9edb3575be304fbbf3a2562fda0f0d8056';
export const INSTALLER_SIZE_LABEL = '94 MB';

/** Starting anchor for the multi-location cloud version, per location per year. */
export const CLOUD_LOCATION_ANCHOR_KOBO = 12_000_000;

export const YOUTUBE_CHANNEL = 'https://www.youtube.com/@Analytiqdigital';
export const YOUTUBE_CHANNEL_LABEL = 'AnalytIQ Digital Academy';

/** YouTube video id (the part after watch?v=). Empty until the tutorial is uploaded. */
export const TUTORIAL_YOUTUBE_ID = '';

export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${SUPPORT_WHATSAPP}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function callUrl(): string {
  return `tel:${SUPPORT_PHONE}`;
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

export type DownloadSource = 'success' | 'public' | 'retrieve' | 'docs';

/** All installer links go through /api/download so clicks can be counted. */
export function trackedDownloadUrl(
  options: {
    reference?: string;
    email?: string;
    business?: string;
    source?: DownloadSource;
  } = {}
): string {
  const params = new URLSearchParams();
  if (options.reference) params.set('ref', options.reference);
  if (options.email) params.set('email', options.email);
  if (options.business) params.set('business', options.business);
  if (options.source) params.set('source', options.source);
  const query = params.toString();
  return `/api/download${query ? `?${query}` : ''}`;
}
