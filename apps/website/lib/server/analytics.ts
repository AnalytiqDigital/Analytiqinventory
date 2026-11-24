import { promotions } from '@analytiq/validation';
import type { DashboardStats, DiscountStat, LocationCount, RecentDownload } from '../analytics';
import type { WebConfig } from './config';

type Row = Record<string, unknown>;

interface RawStats {
  ok?: unknown;
  error?: unknown;
  generatedAt?: unknown;
  totals?: Row;
  discounts?: unknown;
  downloadsByCountry?: unknown;
  downloadsByCity?: unknown;
  recentDownloads?: unknown;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => !!row && typeof row === 'object')
    : [];
}

function locationCounts(value: unknown): LocationCount[] {
  return rows(value)
    .map((row) => ({
      name: text(row.name ?? row.country ?? row.city, 80),
      count: count(row.count),
    }))
    .filter((row) => row.name.length > 0 && row.count > 0)
    .slice(0, 20);
}

function recent(value: unknown): RecentDownload[] {
  return rows(value)
    .slice(-20)
    .reverse()
    .map((row) => ({
      at: text(row.at, 40),
      reference: text(row.reference, 80),
      email: text(row.email, 200),
      business: text(row.business, 120),
      source: text(row.source, 30),
      installerVersion: text(row.installerVersion, 40),
      country: text(row.country, 80),
      city: text(row.city, 80),
    }));
}

function discounts(value: unknown): DiscountStat[] {
  const used = new Map<string, DiscountStat>();
  for (const row of rows(value)) {
    const code = text(row.code, 40).toUpperCase();
    if (!code || used.has(code)) continue;
    used.set(code, {
      code,
      label: '',
      active: false,
      redemptions: count(row.redemptions),
      discountKobo: count(row.discountKobo),
      revenueKobo: count(row.revenueKobo),
    });
  }

  const codes = new Set<string>([...promotions.map((promotion) => promotion.code), ...used.keys()]);
  return [...codes].sort().map((code) => {
    const catalogue = promotions.find((promotion) => promotion.code === code);
    const recorded = used.get(code);
    return {
      code,
      label: catalogue?.label ?? 'Unlisted code',
      active: catalogue?.active === true,
      redemptions: recorded?.redemptions ?? 0,
      discountKobo: recorded?.discountKobo ?? 0,
      revenueKobo: recorded?.revenueKobo ?? 0,
    };
  });
}

function normalise(raw: RawStats): DashboardStats {
  const totals = raw.totals ?? {};
  return {
    generatedAt: text(raw.generatedAt, 40) || new Date().toISOString(),
    totals: {
      downloads: count(totals.downloads),
      paidOrders: count(totals.paidOrders),
      revenueKobo: count(totals.revenueKobo),
      discountKobo: count(totals.discountKobo),
      redemptions: count(totals.redemptions),
      leads: count(totals.leads),
      activeLicences: count(totals.activeLicences),
    },
    discounts: discounts(raw.discounts),
    downloadsByCountry: locationCounts(raw.downloadsByCountry),
    downloadsByCity: locationCounts(raw.downloadsByCity),
    recentDownloads: recent(raw.recentDownloads),
  };
}

/**
 * Apps Script stats are fetched from `doGet`: a POST would follow a redirect
 * and lose the JSON body. The script secret stays server-side.
 */
export async function fetchDashboardStats(
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DashboardStats> {
  if (!config.appsScriptUrl || !config.appsScriptSecret) {
    throw new Error('Analytics are not configured. Set APPS_SCRIPT_URL and APPS_SCRIPT_SECRET.');
  }

  const url = new URL(config.appsScriptUrl);
  url.searchParams.set('action', 'stats');
  url.searchParams.set('secret', config.appsScriptSecret);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Could not reach the analytics service');
  }

  if (!response.ok) {
    throw new Error(`Analytics service returned ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('Analytics service returned invalid data');
  }
  if (!body || typeof body !== 'object') {
    throw new Error('Analytics service returned invalid data');
  }

  const raw = body as RawStats;
  if (raw.ok !== true) {
    throw new Error(text(raw.error, 200) || 'Analytics service refused the request');
  }
  return normalise(raw);
}
