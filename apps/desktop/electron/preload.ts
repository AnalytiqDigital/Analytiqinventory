import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

let realtimeListener: ((event: IpcRendererEvent, data: RealtimeEvent) => void) | null = null;

// Allow-listed, validated IPC surface. Renderer gets no Node access and
// never sees session tokens: auth state lives in the main process.
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  log: (level: 'info' | 'warn' | 'error', message: string): Promise<void> =>
    ipcRenderer.invoke('app:log', level, message),
  realtimeSubscribe: (callback: (event: RealtimeEvent) => void): void => {
    if (realtimeListener) ipcRenderer.removeListener('realtime:event', realtimeListener);
    realtimeListener = (_event, data) => callback(data);
    ipcRenderer.on('realtime:event', realtimeListener);
  },
  realtimeUnsubscribe: (): void => {
    if (realtimeListener) {
      ipcRenderer.removeListener('realtime:event', realtimeListener);
      realtimeListener = null;
    }
  },
  authStatus: (): Promise<{ setupComplete: boolean }> => ipcRenderer.invoke('auth:status'),
  authSetup: (input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('auth:setup', input),
  authLogin: (
    input: unknown
  ): Promise<{ ok: boolean; user?: unknown; expiresAt?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('auth:login', input),
  authLogout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:logout'),
  authMe: (): Promise<{ user: unknown }> => ipcRenderer.invoke('auth:me'),
  categories: (): Promise<{ ok: boolean; items?: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:categories'),
  categoryCreate: (input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:category-create', input),
  categoryUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; category?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:category-update', { id, patch }),
  products: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:products', query),
  productGet: (
    id: string
  ): Promise<{ ok: boolean; product?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-get', id),
  productCreate: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-create', input),
  productByBarcode: (
    code: string
  ): Promise<{ ok: boolean; product?: unknown | null; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-by-barcode', code),
  productUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-update', { id, patch }),
  productArchive: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-archive', id),
  productRestore: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-restore', id),
  stockLevels: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:levels', query),
  stockAdjust: (
    input: unknown
  ): Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:adjust', input),
  stockCount: (
    input: unknown
  ): Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:count', input),
  stockMovements: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:movements', query),
  saleCreate: (
    input: unknown
  ): Promise<{
    ok: boolean;
    id?: string;
    receiptNo?: string;
    totalKobo?: number;
    changeKobo?: number;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('sales:create', input),
  sales: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:list', query),
  saleGet: (id: string): Promise<{ ok: boolean; sale?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:get', id),
  saleRefund: (
    id: string,
    input: unknown
  ): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:refund', { id, input }),
  saleVoid: (id: string, input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:void', { id, input }),
  taxCategories: (): Promise<{
    ok: boolean;
    items: unknown[];
    defaultId?: string;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('inventory:tax-categories'),
  taxCategoryCreate: (
    input: unknown
  ): Promise<{ ok: boolean; category?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:tax-category-create', input),
  taxCategoryUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; category?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:tax-category-update', { id, patch }),
  tables: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:list', query),
  tableCreate: (
    input: unknown
  ): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:create', input),
  tableUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:update', { id, patch }),
  tableSetStatus: (
    id: string,
    input: unknown
  ): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:set-status', { id, input }),
  tableDelete: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:delete', id),

  // --- Batch 6: customers, suppliers, purchasing ---
  customers: (
    query: unknown
  ): Promise<{
    ok: boolean;
    items: unknown[];
    total: number;
    outstandingKobo: number;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('customers:list', query),
  customersGet: (
    id: string
  ): Promise<{ ok: boolean; customer?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:get', id),
  customersCreate: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:create', input),
  customersUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:update', { id, patch }),
  customersArchive: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:archive', id),
  customersPayments: (
    id: string
  ): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:payments', id),
  customersPayment: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; balanceKobo?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('customers:payment', input),

  suppliers: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('suppliers:list', query),
  suppliersCreate: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('suppliers:create', input),
  suppliersUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('suppliers:update', { id, patch }),
  suppliersArchive: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('suppliers:archive', id),

  purchases: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('purchases:list', query),
  purchasesCreate: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; reference?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('purchases:create', input),
  purchasesReceive: (
    id: string
  ): Promise<{ ok: boolean; stockLines?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('purchases:receive', id),
  purchasesCancel: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('purchases:cancel', id),

  // --- Batch 16: masters, stock adjustments, purchase returns, menu reports ---
  mastersList: (
    kind: string
  ): Promise<{ ok: boolean; items?: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('masters:list', kind),
  mastersCreate: (
    kind: string,
    input: unknown
  ): Promise<{ ok: boolean; item?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('masters:create', { kind, input }),
  mastersUpdate: (
    kind: string,
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; item?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('masters:update', { kind, id, patch }),
  stockAdjustments: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('stock-adjustments:list', query),
  stockAdjustmentCreate: (
    input: unknown
  ): Promise<{ ok: boolean; id?: string; reference?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('stock-adjustments:create', input),
  purchaseReturns: (
    query: unknown
  ): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('purchase-returns:list', query),
  purchaseReturnCreate: (
    input: unknown
  ): Promise<{
    ok: boolean;
    id?: string;
    reference?: string;
    totalKobo?: number;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('purchase-returns:create', input),
  reportsMenu: (
    query: unknown
  ): Promise<{ ok: boolean; report?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('reports:menu', query),

  reportsSummary: (
    query: unknown
  ): Promise<{ ok: boolean; summary?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('reports:summary', query),

  // --- Batch 12: backups ---
  backups: (): Promise<{
    ok: boolean;
    dir?: string;
    items?: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:list'),
  backupCreate: (): Promise<{
    ok: boolean;
    backup?: unknown;
    pruned?: number;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:create'),
  backupRestore: (
    name: string
  ): Promise<{
    ok: boolean;
    restored?: unknown;
    safetyBackup?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:restore', name),
  backupDelete: (
    name: string
  ): Promise<{ ok: boolean; removed?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('backup:delete', name),
  backupReveal: (): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('backup:reveal'),
  offsiteBackupStatus: (): Promise<{
    ok: boolean;
    status?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:offsite-status'),
  chooseOffsiteBackup: (): Promise<{
    ok: boolean;
    canceled?: boolean;
    status?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:offsite-choose'),
  skipOffsiteBackup: (): Promise<{
    ok: boolean;
    status?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('backup:offsite-skip'),

  // --- Batch 10: offline license ---
  licenseStatus: (): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('license:status'),
  licenseActivate: (
    key: string
  ): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: (): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('license:deactivate'),

  // --- Batch 12: update check + safe external links ---
  updateCheck: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('app:update-check'),
  openExternal: (url: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('app:open-external', url),

  // --- Batch 8: locations + hub sync ---
  locations: (): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('locations:list'),
  locationCreate: (
    input: unknown
  ): Promise<{ ok: boolean; location?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('locations:create', input),
  locationUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; location?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('locations:update', { id, patch }),
  syncStatus: (
    query?: unknown
  ): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('sync:status', query),
  syncConfigure: (
    input: unknown
  ): Promise<{ ok: boolean; settings?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('sync:configure', input),
  syncNow: (): Promise<{
    ok: boolean;
    pushed?: number;
    pulled?: number;
    finishedAt?: string;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('sync:now'),

  // --- Batch 11: AI + WhatsApp automation ---
  automationSettings: (): Promise<{
    ok: boolean;
    settings?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('automation:settings'),
  automationSave: (
    input: unknown
  ): Promise<{ ok: boolean; settings?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('automation:save', input),
  automationMessages: (
    limit?: number
  ): Promise<{ ok: boolean; messages?: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('automation:messages', limit),
  automationTest: (
    input: unknown
  ): Promise<{ ok: boolean; message?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('automation:test', input),
  automationRun: (): Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('automation:run'),

  // --- Batch 13: bulk import + receipt header ---
  businessProfile: (): Promise<{
    ok: boolean;
    business?: unknown;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('business:profile'),
  importProducts: (
    input: unknown
  ): Promise<{
    ok: boolean;
    created: number;
    failed: number;
    errors: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('import:products', input),
  importPurchases: (
    input: unknown
  ): Promise<{
    ok: boolean;
    created: number;
    failed: number;
    errors: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('import:purchases', input),
  importSales: (
    input: unknown
  ): Promise<{
    ok: boolean;
    created: number;
    failed: number;
    errors: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('import:sales', input),
  importOpeningStock: (
    input: unknown
  ): Promise<{
    ok: boolean;
    created: number;
    failed: number;
    errors: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('import:opening-stock', input),
  importContacts: (
    input: unknown
  ): Promise<{
    ok: boolean;
    created: number;
    failed: number;
    errors: unknown[];
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('import:contacts', input),

  // --- Batch 14: staff, role permissions and expenses ---
  staff: (): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:list'),
  staffCreate: (
    input: unknown
  ): Promise<{ ok: boolean; staff?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:create', input),
  staffUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; staff?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:update', { id, patch }),
  staffResetPassword: (
    id: string,
    password: string
  ): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:reset-password', { id, password }),
  staffRoles: (): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:roles'),
  staffRolePermissions: (
    id: string,
    permissions: string[]
  ): Promise<{ ok: boolean; role?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('staff:role-permissions', { id, permissions }),
  expenses: (
    query: unknown
  ): Promise<{
    ok: boolean;
    items: unknown[];
    totalKobo: number;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('finance:expenses', query),
  expenseCreate: (
    input: unknown
  ): Promise<{ ok: boolean; expense?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('finance:create-expense', input),
  expenseUpdate: (
    id: string,
    patch: unknown
  ): Promise<{ ok: boolean; expense?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('finance:update-expense', { id, patch }),
  expenseDelete: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('finance:delete-expense', id),

  // --- Batch 13: thermal receipt printer (Xprinter and any Windows driver) ---
  printerList: (): Promise<{
    ok: boolean;
    printers?: Array<{ name: string; displayName: string; isDefault: boolean; status?: number }>;
    error?: string;
    code?: string;
  }> => ipcRenderer.invoke('printer:list'),
  printerPrint: (input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('printer:print', input),
  printerSavePdf: (
    input: unknown
  ): Promise<{ ok: boolean; error?: string; code?: string; canceled?: boolean; path?: string }> =>
    ipcRenderer.invoke('printer:save-pdf', input),

  // --- Batch 15: business pack ---
  modulesView: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('modules:install-view'),
  modulesSet: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('modules:install-set', input),
  batches: (query: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('batches:list', query),
  batchIntake: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('batches:intake', input),
  expiryAlerts: (withinDays?: number): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('batches:expiry-alerts', withinDays),
  priceTiers: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:list'),
  priceTierCreate: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:create', input),
  priceTierUpdate: (id: string, patch: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:update', { id, patch }),
  priceTierDelete: (id: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:delete', id),
  tierPrices: (id: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:prices', id),
  tierPricesSet: (id: string, prices: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('price-tiers:prices-set', { id, prices }),
  loyaltySettings: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('loyalty:settings'),
  loyaltySettingsSet: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('loyalty:settings-set', input),
  loyaltyEntries: (customerId: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('loyalty:entries', customerId),
  loyaltyAdjust: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('loyalty:adjust', input),
  customerNotes: (customerId: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('customers:notes', customerId),
  customerNoteAdd: (id: string, note: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('customers:note-add', { id, note }),
  customerVisitSummary: (customerId: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('customers:visit-summary', customerId),
  returnLookup: (receiptNo: string): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('returns:lookup', receiptNo),
  returnCreate: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('returns:create', input),
  returnsList: (query: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('returns:list', query),
  transfers: (query: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('transfers:list', query),
  transferCreate: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('transfers:create', input),
  debtors: (query: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('debtors:list', query),
  debtorRemind: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('debtors:remind', input),
  cloudBackupSettings: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('cloud-backup:settings'),
  cloudBackupSave: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('cloud-backup:settings-set', input),
  cloudBackupRun: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('cloud-backup:run'),
  cloudBackupUploads: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('cloud-backup:uploads'),

  // --- Batch 17: cash & bank accounts + restaurant service settings ---
  accounts: (query?: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:list', query ?? {}),
  accountCreate: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:create', input),
  accountUpdate: (id: string, patch: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:update', { id, patch }),
  accountTransfer: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:transfer', input),
  accountAdjust: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:adjust', input),
  accountTransactions: (query: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:transactions', query),
  accountPaymentMap: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:payment-map'),
  accountPaymentMapSet: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('accounts:payment-map-set', input),
  restaurantSettings: (): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('restaurant:settings'),
  restaurantSettingsSet: (input: unknown): Promise<{ ok: boolean; [key: string]: unknown }> =>
    ipcRenderer.invoke('restaurant:settings-set', input),
};

export type AnalytiqApi = typeof api;

contextBridge.exposeInMainWorld('analytiq', api);
