export const SUPPORT_WHATSAPP = '2348124314217';
export const SUPPORT_WHATSAPP_LABEL = '+234 812 431 4217';
export const DOWNLOAD_FALLBACK_PATH = '/download';

export function whatsappUrl(message?: string): string {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP?.trim();
  const number = (configured && configured.length > 0 ? configured : SUPPORT_WHATSAPP).replace(
    /\D/g,
    ''
  );
  const base = `https://wa.me/${number}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function downloadUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DOWNLOAD_URL?.trim();
  return configured && configured.length > 0 ? configured : DOWNLOAD_FALLBACK_PATH;
}

export function isInstallerHosted(): boolean {
  return downloadUrl() !== DOWNLOAD_FALLBACK_PATH;
}
