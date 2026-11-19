import type { AnalytiqApi } from '../types/global';

function fallbackApi(): AnalytiqApi {
  return {
    ping: () => Promise.resolve('pong (browser fallback)'),
    getVersion: () => Promise.resolve('0.1.0-dev'),
    log: () => Promise.resolve(),
    realtimeSubscribe: () => undefined,
    realtimeUnsubscribe: () => undefined,
    authStatus: () => Promise.resolve({ setupComplete: true }),
    authSetup: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    authLogin: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    authLogout: () => Promise.resolve({ ok: false }),
    authMe: () => Promise.resolve({ user: null }),
    categories: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    categoryCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    products: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    productGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productArchive: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productRestore: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockLevels: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    stockAdjust: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockCount: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockMovements: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    saleCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    sales: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    saleGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    saleRefund: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    saleVoid: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    taxCategories: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    taxCategoryCreate: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    taxCategoryUpdate: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    tables: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    tableCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    tableUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    tableSetStatus: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    tableDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    customers: () =>
      Promise.resolve({
        ok: false,
        items: [],
        total: 0,
        outstandingKobo: 0,
        error: 'Unavailable in browser preview',
      }),
    customersGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customersCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customersUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customersArchive: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customersPayments: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    customersPayment: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    suppliers: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    suppliersCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    suppliersUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    suppliersArchive: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    purchases: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    purchasesCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    purchasesReceive: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    purchasesCancel: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    reportsSummary: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    backups: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    backupCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupRestore: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupReveal: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    licenseStatus: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    licenseActivate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    updateCheck: () =>
      Promise.resolve({
        ok: false,
        configured: false,
        currentVersion: '0.1.0-dev',
        error: 'Unavailable in browser preview',
      }),
    openExternal: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    locations: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    locationCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    locationUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    syncStatus: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    syncConfigure: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    syncNow: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    automationSettings: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    automationSave: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    automationMessages: () =>
      Promise.resolve({ ok: false, messages: [], error: 'Unavailable in browser preview' }),
    automationTest: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    automationRun: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  };
}

export const ipc: AnalytiqApi =
  typeof window !== 'undefined' && window.analytiq ? window.analytiq : fallbackApi();

export function reportRendererError(message: string): void {
  void ipc.log('error', message.slice(0, 2000));
}
