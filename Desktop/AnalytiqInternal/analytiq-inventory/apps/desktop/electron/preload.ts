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

  // --- Batch 10: offline license ---
  licenseStatus: (): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('license:status'),
  licenseActivate: (
    key: string
  ): Promise<{ ok: boolean; status?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('license:activate', key),

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
};

export type AnalytiqApi = typeof api;

contextBridge.exposeInMainWorld('analytiq', api);
