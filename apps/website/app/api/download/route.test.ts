import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const APPS_URL = 'https://script.google.com/macros/s/abc/exec';
const INSTALLER = 'https://installer.example/AnalytIQ.zip';

function request(): Request {
  const headers = new Headers({
    'x-Vercel-ip-country': 'NG',
    'cf-ipcity': 'Lagos',
    'user-agent': 'AnalytIQ test',
  });
  return new Request(
    'https://shop.example/api/download?ref=ord_aaaaaaaaaaaaaaaaaaaaaaaa&email=ada%40example.com&source=success',
    { headers }
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('tracked download route', () => {
  it('logs the click with location headers and redirects to the installer', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL', INSTALLER);
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'script-secret');
    const fetchMock = vi.fn(async () => new Response('', { status: 302 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(INSTALLER);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(APPS_URL);
    const body = JSON.parse(String(init.body)) as {
      action: string;
      secret: string;
      download: { reference: string; email: string; source: string; country: string; city: string };
    };
    expect(body).toMatchObject({
      action: 'download',
      secret: 'script-secret',
      download: {
        reference: 'ord_aaaaaaaaaaaaaaaaaaaaaaaa',
        email: 'ada@example.com',
        source: 'success',
        country: 'NG',
        city: 'Lagos',
      },
    });
  });

  it('returns 404 when no external installer is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL', '/download');
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'script-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 302 }))
    );

    const response = await GET(request());
    expect(response.status).toBe(404);
  });

  it('still redirects when analytics logging fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_DOWNLOAD_URL', INSTALLER);
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'script-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch
    );

    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(INSTALLER);
  });
});
