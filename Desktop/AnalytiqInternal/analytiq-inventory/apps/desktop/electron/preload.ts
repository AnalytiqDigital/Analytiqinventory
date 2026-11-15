import { contextBridge, ipcRenderer } from 'electron';

// Allow-listed, validated IPC surface. Renderer gets no Node access and
// never sees session tokens: auth state lives in the main process.
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  log: (level: 'info' | 'warn' | 'error', message: string): Promise<void> =>
    ipcRenderer.invoke('app:log', level, message),
  authStatus: (): Promise<{ setupComplete: boolean }> => ipcRenderer.invoke('auth:status'),
  authSetup: (input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('auth:setup', input),
  authLogin: (
    input: unknown,
  ): Promise<{ ok: boolean; user?: unknown; expiresAt?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('auth:login', input),
  authLogout: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('auth:logout'),
  authMe: (): Promise<{ user: unknown }> => ipcRenderer.invoke('auth:me'),
  categories: (): Promise<{ ok: boolean; items?: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:categories'),
  categoryCreate: (input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:category-create', input),
  products: (query: unknown): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:products', query),
  productGet: (id: string): Promise<{ ok: boolean; product?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-get', id),
  productCreate: (input: unknown): Promise<{ ok: boolean; id?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-create', input),
  productUpdate: (id: string, patch: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-update', { id, patch }),
  productArchive: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-archive', id),
  productRestore: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:product-restore', id),
  stockLevels: (query: unknown): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:levels', query),
  stockAdjust: (input: unknown): Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:adjust', input),
  stockCount: (input: unknown): Promise<{ ok: boolean; qtyAfter?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:count', input),
  stockMovements: (query: unknown): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:movements', query),
  saleCreate: (input: unknown): Promise<{ ok: boolean; id?: string; receiptNo?: string; totalKobo?: number; changeKobo?: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:create', input),
  sales: (query: unknown): Promise<{ ok: boolean; items: unknown[]; total: number; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:list', query),
  saleGet: (id: string): Promise<{ ok: boolean; sale?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:get', id),
  saleRefund: (id: string, input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:refund', { id, input }),
  saleVoid: (id: string, input: unknown): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('sales:void', { id, input }),
  taxCategories: (): Promise<{ ok: boolean; items: unknown[]; defaultId?: string; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:tax-categories'),
  taxCategoryCreate: (input: unknown): Promise<{ ok: boolean; category?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:tax-category-create', input),
  taxCategoryUpdate: (id: string, patch: unknown): Promise<{ ok: boolean; category?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('inventory:tax-category-update', { id, patch }),
  tables: (query: unknown): Promise<{ ok: boolean; items: unknown[]; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:list', query),
  tableCreate: (input: unknown): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:create', input),
  tableUpdate: (id: string, patch: unknown): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:update', { id, patch }),
  tableSetStatus: (id: string, input: unknown): Promise<{ ok: boolean; table?: unknown; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:set-status', { id, input }),
  tableDelete: (id: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
    ipcRenderer.invoke('tables:delete', id),
};

export type AnalytiqApi = typeof api;

contextBridge.exposeInMainWorld('analytiq', api);
