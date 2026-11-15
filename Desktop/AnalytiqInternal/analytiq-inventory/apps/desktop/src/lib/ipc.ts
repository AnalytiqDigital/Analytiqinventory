import type { AnalytiqApi } from '../types/global';

function fallbackApi(): AnalytiqApi {
  return {
    ping: () => Promise.resolve('pong (browser fallback)'),
    getVersion: () => Promise.resolve('0.1.0-dev'),
    log: () => Promise.resolve(),
    authStatus: () => Promise.resolve({ setupComplete: true }),
    authSetup: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    authLogin: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    authLogout: () => Promise.resolve({ ok: false }),
    authMe: () => Promise.resolve({ user: null }),
    categories: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    categoryCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    products: () => Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    productGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productArchive: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productRestore: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockLevels: () => Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    stockAdjust: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockCount: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockMovements: () => Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
  saleCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  sales: () => Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
  saleGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  saleRefund: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  saleVoid: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  taxCategories: () => Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
  taxCategoryCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  taxCategoryUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  tables: () => Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
  tableCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  tableUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  tableSetStatus: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  tableDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  };
}

export const ipc: AnalytiqApi =
  typeof window !== 'undefined' && window.analytiq ? window.analytiq : fallbackApi();

export function reportRendererError(message: string): void {
  void ipc.log('error', message.slice(0, 2000));
}
