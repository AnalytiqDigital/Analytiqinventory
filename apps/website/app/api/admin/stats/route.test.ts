import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const TOKEN = 'a-very-long-admin-token';
const APPS_URL = 'https://script.google.com/macros/s/abc/exec';

function request(token = TOKEN): Request {
  const headers = new Headers();
  if (token) headers.set('x-admin-token', token);
  return new Request('https://shop.example/api/admin/stats', { headers });
}

function stubStats(body: unknown = { ok: true, generatedAt: '2026-11-18T12:00:00.000Z' }) {
  const fetchImpl = vi.fn(async () => Response.json(body));
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('admin stats API', () => {
  it('returns a setup message when no admin token is configured', async () => {
    vi.stubEnv('ADMIN_DASHBOARD_TOKEN', '');
    const fetchImpl = stubStats();

    const response = await GET(request(''));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong token without calling Apps Script', async () => {
    vi.stubEnv('ADMIN_DASHBOARD_TOKEN', TOKEN);
    const fetchImpl = stubStats();

    expect((await GET(request(''))).status).toBe(401);
    expect((await GET(request('wrong-token'))).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proxies normalised stats for the correct token', async () => {
    vi.stubEnv('ADMIN_DASHBOARD_TOKEN', TOKEN);
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'script-secret');
    const fetchImpl = stubStats({
      ok: true,
      generatedAt: '2026-11-18T12:00:00.000Z',
      totals: { downloads: 5, paidOrders: 2, revenueKobo: 12_000_000 },
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as {
      ok: boolean;
      stats: { totals: { downloads: number; paidOrders: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.stats.totals).toMatchObject({ downloads: 5, paidOrders: 2 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns a clean 502 when Apps Script fails', async () => {
    vi.stubEnv('ADMIN_DASHBOARD_TOKEN', TOKEN);
    vi.stubEnv('APPS_SCRIPT_URL', APPS_URL);
    vi.stubEnv('APPS_SCRIPT_SECRET', 'script-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    );

    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false });
  });
});
