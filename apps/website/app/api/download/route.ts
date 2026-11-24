import { loadWebConfig } from '../../../lib/server/config';
import { locationFromHeaders, recordDownload } from '../../../lib/server/delivery';
import { isOrderReference } from '../../../lib/server/http';
import {
  DOWNLOAD_FALLBACK_PATH,
  INSTALLER_VERSION,
  downloadUrl,
  type DownloadSource,
} from '../../../lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCES: DownloadSource[] = ['success', 'public', 'retrieve', 'docs'];

function clip(value: string | null, max: number): string {
  return value?.trim().slice(0, max) ?? '';
}

export async function GET(request: Request): Promise<Response> {
  const target = downloadUrl();
  if (target === DOWNLOAD_FALLBACK_PATH || target.startsWith('/api/')) {
    return Response.json({ ok: false, error: 'No installer URL is configured' }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawSource = clip(url.searchParams.get('source'), 20) as DownloadSource;
  const reference = clip(url.searchParams.get('ref'), 80);
  const config = loadWebConfig();

  // Analytics are best effort: a slow or broken Apps Script never blocks the
  // customer from receiving the installer.
  await recordDownload(
    {
      reference: isOrderReference(reference) ? reference : '',
      email: clip(url.searchParams.get('email'), 200),
      business: clip(url.searchParams.get('business'), 120),
      source: SOURCES.includes(rawSource) ? rawSource : 'public',
      userAgent: clip(request.headers.get('user-agent'), 300),
      installerVersion: INSTALLER_VERSION,
      ...locationFromHeaders(request.headers),
    },
    config
  );

  return Response.redirect(target, 302);
}
