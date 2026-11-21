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
    categoryUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    products: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    productGet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    productByBarcode: () =>
      Promise.resolve({ ok: false, product: null, error: 'Unavailable in browser preview' }),
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

    mastersList: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    mastersCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    mastersUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    stockAdjustments: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    stockAdjustmentCreate: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    purchaseReturns: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    purchaseReturnCreate: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    reportsMenu: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    reportsSummary: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

    backups: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    backupCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupRestore: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    backupReveal: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    offsiteBackupStatus: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    chooseOffsiteBackup: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    skipOffsiteBackup: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),

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
    businessProfile: () =>
      Promise.resolve({ ok: false, business: null, error: 'Unavailable in browser preview' }),
    importProducts: () =>
      Promise.resolve({
        ok: false,
        created: 0,
        failed: 0,
        errors: [],
        error: 'Unavailable in browser preview',
      }),
    importPurchases: () =>
      Promise.resolve({
        ok: false,
        created: 0,
        failed: 0,
        errors: [],
        error: 'Unavailable in browser preview',
      }),
    importSales: () =>
      Promise.resolve({
        ok: false,
        created: 0,
        failed: 0,
        errors: [],
        error: 'Unavailable in browser preview',
      }),
    importOpeningStock: () =>
      Promise.resolve({
        ok: false,
        created: 0,
        failed: 0,
        errors: [],
        error: 'Unavailable in browser preview',
      }),
    importContacts: () =>
      Promise.resolve({
        ok: false,
        created: 0,
        failed: 0,
        errors: [],
        error: 'Unavailable in browser preview',
      }),
    staff: () => Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    staffCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    staffUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    staffResetPassword: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    staffRoles: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    staffRolePermissions: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    expenses: () =>
      Promise.resolve({
        ok: false,
        items: [],
        totalKobo: 0,
        error: 'Unavailable in browser preview',
      }),
    expenseCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    expenseUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    expenseDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    printerList: () =>
      Promise.resolve({ ok: false, printers: [], error: 'Unavailable in browser preview' }),
    printerPrint: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    modulesView: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    modulesSet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    batches: () =>
      Promise.resolve({
        ok: false,
        items: [],
        total: 0,
        expiringCount: 0,
        expiredCount: 0,
        error: 'Unavailable in browser preview',
      }),
    batchIntake: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    expiryAlerts: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    priceTiers: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    priceTierCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    priceTierUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    priceTierDelete: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    tierPrices: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    tierPricesSet: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    loyaltySettings: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    loyaltySettingsSet: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    loyaltyEntries: () =>
      Promise.resolve({
        ok: false,
        items: [],
        balance: 0,
        error: 'Unavailable in browser preview',
      }),
    loyaltyAdjust: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customerNotes: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    customerNoteAdd: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    customerVisitSummary: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    returnLookup: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    returnCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    returnsList: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    transfers: () =>
      Promise.resolve({ ok: false, items: [], total: 0, error: 'Unavailable in browser preview' }),
    transferCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    debtors: () =>
      Promise.resolve({
        ok: false,
        items: [],
        totalKobo: 0,
        error: 'Unavailable in browser preview',
      }),
    debtorRemind: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    cloudBackupSettings: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    cloudBackupSave: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    cloudBackupRun: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    cloudBackupUploads: () =>
      Promise.resolve({ ok: false, items: [], error: 'Unavailable in browser preview' }),
    accounts: () =>
      Promise.resolve({ ok: false, items: [], totalKobo: 0, error: 'Unavailable in browser preview' }),
    accountCreate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    accountUpdate: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    accountTransfer: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    accountAdjust: () => Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    accountTransactions: () =>
      Promise.resolve({
        ok: false,
        items: [],
        moneyInKobo: 0,
        moneyOutKobo: 0,
        error: 'Unavailable in browser preview',
      }),
    accountPaymentMap: () =>
      Promise.resolve({ ok: false, map: {}, error: 'Unavailable in browser preview' }),
    accountPaymentMapSet: () =>
      Promise.resolve({ ok: false, map: {}, error: 'Unavailable in browser preview' }),
    restaurantSettings: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
    restaurantSettingsSet: () =>
      Promise.resolve({ ok: false, error: 'Unavailable in browser preview' }),
  };
}

export const ipc: AnalytiqApi =
  typeof window !== 'undefined' && window.analytiq ? window.analytiq : fallbackApi();

export function reportRendererError(message: string): void {
  void ipc.log('error', message.slice(0, 2000));
}
