/** Shared dashboard shapes. Safe to import from client components. */

export interface DashboardTotals {
  downloads: number;
  paidOrders: number;
  revenueKobo: number;
  discountKobo: number;
  redemptions: number;
  leads: number;
  activeLicences: number;
}

export interface DiscountStat {
  code: string;
  label: string;
  active: boolean;
  redemptions: number;
  discountKobo: number;
  revenueKobo: number;
}

export interface LocationCount {
  name: string;
  count: number;
}

export interface RecentDownload {
  at: string;
  reference: string;
  email: string;
  business: string;
  source: string;
  installerVersion: string;
  country: string;
  city: string;
}

export interface DashboardStats {
  generatedAt: string;
  totals: DashboardTotals;
  discounts: DiscountStat[];
  downloadsByCountry: LocationCount[];
  downloadsByCity: LocationCount[];
  recentDownloads: RecentDownload[];
}
