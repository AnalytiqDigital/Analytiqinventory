import { describe, expect, it, vi } from 'vitest';
import { fetchDashboardStats } from './analytics';
import type { WebConfig } from './config';

const config = {
  appsScriptUrl: 'https://script.google.com/macros/s/abc/exec',
  appsScriptSecret: 'script-secret',
} as WebConfig;

describe('dashboard analytics', () => {
  it('calls the Apps Script stats action and normalises the response', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('action')).toBe('stats');
      expect(url.searchParams.get('secret')).toBe('script-secret');
      return Response.json({
        ok: true,
        generatedAt: '2026-11-18T12:00:00.000Z',
        totals: {
          downloads: 12,
          paidOrders: 3,
          revenueKobo: 18_000_000,
          discountKobo: 2_000_000,
          redemptions: 1,
          leads: 4,
          activeLicences: 2,
        },
        discounts: [
          { code: 'save20000', redemptions: 1, discountKobo: 2_000_000, revenueKobo: 6_000_000 },
        ],
        downloadsByCountry: [{ name: 'NG', count: 10 }],
        downloadsByCity: [{ name: 'Lagos', count: 8 }],
        recentDownloads: [
          {
            at: '2026-11-18T11:00:00.000Z',
            email: 'ada@example.com',
            business: 'Ada Stores',
            source: 'success',
            country: 'NG',
            city: 'Lagos',
          },
        ],
      });
    }) as unknown as typeof fetch;

    const stats = await fetchDashboardStats(config, fetchImpl);
    expect(stats.totals).toMatchObject({ downloads: 12, revenueKobo: 18_000_000 });
    expect(stats.discounts).toEqual([
      {
        code: 'SAVE20000',
        label: 'Launch discount',
        active: true,
        redemptions: 1,
        discountKobo: 2_000_000,
        revenueKobo: 6_000_000,
      },
    ]);
    expect(stats.downloadsByCountry).toEqual([{ name: 'NG', count: 10 }]);
    expect(stats.recentDownloads[0]).toMatchObject({ city: 'Lagos', source: 'success' });
  });

  it('keeps unlisted historical codes and flags them as inactive', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        discounts: [
          { code: 'OLD500', redemptions: 2, discountKobo: 500_000, revenueKobo: 1_000_000 },
        ],
      })
    ) as unknown as typeof fetch;

    const stats = await fetchDashboardStats(config, fetchImpl);
    expect(stats.discounts).toEqual([
      {
        code: 'OLD500',
        label: 'Unlisted code',
        active: false,
        redemptions: 2,
        discountKobo: 500_000,
        revenueKobo: 1_000_000,
      },
      {
        code: 'SAVE20000',
        label: 'Launch discount',
        active: true,
        redemptions: 0,
        discountKobo: 0,
        revenueKobo: 0,
      },
    ]);
  });

  it('reports a clean error when Apps Script refuses the request', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: false, error: 'bad secret' })
    ) as unknown as typeof fetch;
    await expect(fetchDashboardStats(config, fetchImpl)).rejects.toThrow('bad secret');
  });

  it('requires the script URL and secret', async () => {
    await expect(
      fetchDashboardStats({ appsScriptUrl: '', appsScriptSecret: '' } as WebConfig)
    ).rejects.toThrow(/not configured/);
  });
});
