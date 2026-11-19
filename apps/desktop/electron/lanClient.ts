import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { io, type Socket } from 'socket.io-client';

// LAN client mode: the desktop app talks to the primary computer's Fastify
// server and never opens SQLite. Each IPC channel maps onto one REST route so
// the renderer is identical in both modes.

type Json = Record<string, unknown>;

interface ApiResult {
  ok: boolean;
  body: Json;
}

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: (args: unknown[]) => string;
  body?: (args: unknown[]) => unknown;
  fallback?: Json;
}

function sessionFile(): string {
  return path.join(app.getPath('userData'), 'lan-session.bin');
}

function loadPersistedToken(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(sessionFile())) return null;
    return safeStorage.decryptString(readFileSync(sessionFile()));
  } catch {
    return null;
  }
}

function persistToken(token: string | null): void {
  try {
    if (!token) {
      rmSync(sessionFile(), { force: true });
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) return;
    writeFileSync(sessionFile(), safeStorage.encryptString(token));
  } catch (err: unknown) {
    log.warn(`Could not persist LAN session: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function endpoint(pathname: string, query: unknown): string {
  if (!query || typeof query !== 'object') return pathname;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Json)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function idArg(args: unknown[]): string {
  const value = args[0];
  if (typeof value !== 'string' || value.length === 0) throw new Error('Record id is required');
  return encodeURIComponent(value);
}

function pairArg(args: unknown[]): { id: string; patch: unknown } {
  const payload = args[0];
  if (!payload || typeof payload !== 'object') throw new Error('Invalid request payload');
  const { id, patch } = payload as { id?: unknown; patch?: unknown };
  if (typeof id !== 'string' || id.length === 0) throw new Error('Record id is required');
  return { id, patch };
}

function inputArg(args: unknown[]): { id: string; input: unknown } {
  const payload = args[0];
  if (!payload || typeof payload !== 'object') throw new Error('Invalid request payload');
  const { id, input } = payload as { id?: unknown; input?: unknown };
  if (typeof id !== 'string' || id.length === 0) throw new Error('Record id is required');
  return { id, input };
}

const ROUTES: Record<string, Route> = {
  'license:status': { method: 'GET', path: () => '/api/license/status' },
  'license:activate': {
    method: 'POST',
    path: () => '/api/license/activate',
    body: (a) => ({ key: a[0] }),
  },

  'inventory:categories': { method: 'GET', path: () => '/api/categories', fallback: { items: [] } },
  'inventory:category-create': { method: 'POST', path: () => '/api/categories', body: (a) => a[0] },
  'inventory:products': {
    method: 'GET',
    path: (a) => endpoint('/api/products', a[0]),
    fallback: { items: [], total: 0 },
  },
  'inventory:product-get': { method: 'GET', path: (a) => `/api/products/${idArg(a)}` },
  'inventory:product-create': { method: 'POST', path: () => '/api/products', body: (a) => a[0] },
  'inventory:product-by-barcode': {
    method: 'GET',
    path: (a) => `/api/products/by-barcode?code=${encodeURIComponent(String(a[0] ?? ''))}`,
    fallback: { product: null },
  },
  'inventory:product-update': {
    method: 'PATCH',
    path: (a) => `/api/products/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },
  'inventory:product-archive': {
    method: 'POST',
    path: (a) => `/api/products/${idArg(a)}/archive`,
  },
  'inventory:product-restore': {
    method: 'POST',
    path: (a) => `/api/products/${idArg(a)}/restore`,
  },
  'inventory:levels': {
    method: 'GET',
    path: (a) => endpoint('/api/stock/levels', a[0]),
    fallback: { items: [], total: 0 },
  },
  'inventory:adjust': { method: 'POST', path: () => '/api/stock/adjust', body: (a) => a[0] },
  'inventory:count': { method: 'POST', path: () => '/api/stock/count', body: (a) => a[0] },
  'inventory:movements': {
    method: 'GET',
    path: (a) => endpoint('/api/stock/movements', a[0]),
    fallback: { items: [], total: 0 },
  },
  'inventory:tax-categories': {
    method: 'GET',
    path: () => '/api/tax-categories',
    fallback: { items: [] },
  },
  'inventory:tax-category-create': {
    method: 'POST',
    path: () => '/api/tax-categories',
    body: (a) => a[0],
  },
  'inventory:tax-category-update': {
    method: 'PATCH',
    path: (a) => `/api/tax-categories/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },

  'sales:create': { method: 'POST', path: () => '/api/sales', body: (a) => a[0] },
  'sales:list': {
    method: 'GET',
    path: (a) => endpoint('/api/sales', a[0]),
    fallback: { items: [], total: 0 },
  },
  'sales:get': { method: 'GET', path: (a) => `/api/sales/${idArg(a)}` },
  'sales:refund': {
    method: 'POST',
    path: (a) => `/api/sales/${inputArg(a).id}/refund`,
    body: (a) => inputArg(a).input,
  },
  'sales:void': {
    method: 'POST',
    path: (a) => `/api/sales/${inputArg(a).id}/void`,
    body: (a) => inputArg(a).input,
  },

  'tables:list': {
    method: 'GET',
    path: (a) => endpoint('/api/tables', a[0]),
    fallback: { items: [] },
  },
  'tables:create': { method: 'POST', path: () => '/api/tables', body: (a) => a[0] },
  'tables:update': {
    method: 'PATCH',
    path: (a) => `/api/tables/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },
  'tables:set-status': {
    method: 'POST',
    path: (a) => `/api/tables/${inputArg(a).id}/status`,
    body: (a) => inputArg(a).input,
  },
  'tables:delete': { method: 'DELETE', path: (a) => `/api/tables/${idArg(a)}` },

  'customers:list': {
    method: 'GET',
    path: (a) => endpoint('/api/customers', a[0]),
    fallback: { items: [], total: 0, outstandingKobo: 0 },
  },
  'customers:get': { method: 'GET', path: (a) => `/api/customers/${idArg(a)}` },
  'customers:create': { method: 'POST', path: () => '/api/customers', body: (a) => a[0] },
  'customers:update': {
    method: 'PATCH',
    path: (a) => `/api/customers/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },
  'customers:archive': {
    method: 'POST',
    path: (a) => `/api/customers/${idArg(a)}/archive`,
  },
  'customers:payments': {
    method: 'GET',
    path: (a) => `/api/customers/${idArg(a)}/payments`,
    fallback: { items: [] },
  },
  'customers:payment': {
    method: 'POST',
    path: () => '/api/customers/payments',
    body: (a) => a[0],
  },

  'suppliers:list': {
    method: 'GET',
    path: (a) => endpoint('/api/suppliers', a[0]),
    fallback: { items: [], total: 0 },
  },
  'suppliers:create': { method: 'POST', path: () => '/api/suppliers', body: (a) => a[0] },
  'suppliers:update': {
    method: 'PATCH',
    path: (a) => `/api/suppliers/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },
  'suppliers:archive': {
    method: 'POST',
    path: (a) => `/api/suppliers/${idArg(a)}/archive`,
  },

  'purchases:list': {
    method: 'GET',
    path: (a) => endpoint('/api/purchases', a[0]),
    fallback: { items: [], total: 0 },
  },
  'purchases:create': { method: 'POST', path: () => '/api/purchases', body: (a) => a[0] },
  'purchases:receive': {
    method: 'POST',
    path: (a) => `/api/purchases/${idArg(a)}/receive`,
  },
  'purchases:cancel': { method: 'POST', path: (a) => `/api/purchases/${idArg(a)}/cancel` },

  'reports:summary': {
    method: 'GET',
    path: (a) => endpoint('/api/reports/summary', a[0]),
    fallback: { summary: null },
  },

  'business:profile': {
    method: 'GET',
    path: () => '/api/business',
    fallback: { business: null },
  },
  'import:products': { method: 'POST', path: () => '/api/import/products', body: (a) => a[0] },
  'import:purchases': { method: 'POST', path: () => '/api/import/purchases', body: (a) => a[0] },
  'import:sales': { method: 'POST', path: () => '/api/import/sales', body: (a) => a[0] },

  'backup:list': {
    method: 'GET',
    path: () => '/api/backups',
    fallback: { items: [], dir: '' },
  },
  'backup:create': { method: 'POST', path: () => '/api/backups' },
  'backup:restore': {
    method: 'POST',
    path: () => '/api/backups/restore',
    body: (a) => ({ name: a[0] }),
  },
  'backup:delete': {
    method: 'DELETE',
    path: (a) => `/api/backups/${encodeURIComponent(String(a[0] ?? ''))}`,
  },

  'locations:list': { method: 'GET', path: () => '/api/locations', fallback: { items: [] } },
  'locations:create': { method: 'POST', path: () => '/api/locations', body: (a) => a[0] },
  'locations:update': {
    method: 'PATCH',
    path: (a) => `/api/locations/${pairArg(a).id}`,
    body: (a) => pairArg(a).patch,
  },

  'sync:status': { method: 'GET', path: () => '/api/sync/status', fallback: { status: null } },
  'sync:configure': { method: 'POST', path: () => '/api/sync/settings', body: (a) => a[0] },
  'sync:now': { method: 'POST', path: () => '/api/sync/now' },

  'automation:settings': {
    method: 'GET',
    path: () => '/api/automation/settings',
    fallback: { settings: null },
  },
  'automation:save': {
    method: 'POST',
    path: () => '/api/automation/settings',
    body: (a) => a[0],
  },
  'automation:messages': {
    method: 'GET',
    path: (a) => endpoint('/api/automation/messages', { limit: a[0] }),
    fallback: { messages: [] },
  },
  'automation:test': { method: 'POST', path: () => '/api/automation/test', body: (a) => a[0] },
  'automation:run': {
    method: 'POST',
    path: () => '/api/automation/run',
    body: () => ({ force: true }),
  },
};

export function registerLanClient(serverUrl: string): void {
  const base = serverUrl.replace(/\/+$/, '');
  let token = loadPersistedToken();
  let socket: Socket | null = null;

  function broadcast(type: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('realtime:event', { type, payload });
    }
  }

  // Realtime is best-effort: the HTTP API stays authoritative when the
  // WebSocket drops, so a failed connection only costs automatic refresh.
  function resetSocket(): void {
    socket?.disconnect();
    socket = null;
    if (!token) return;
    socket = io(base, { auth: { token }, transports: ['websocket'] });
    for (const type of [
      'inventory.changed',
      'sale.created',
      'sale.updated',
      'customer.updated',
      'table.updated',
      'location.updated',
      'sync.changed',
      'automation.changed',
    ]) {
      socket.on(type, (payload: unknown) => broadcast(type, payload));
    }
    socket.on('connect_error', (err) => {
      log.warn(`LAN realtime connection failed: ${err.message}`);
    });
  }

  resetSocket();

  async function request(
    method: string,
    pathname: string,
    body: unknown,
    withAuth: boolean
  ): Promise<ApiResult> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (withAuth && token) headers.authorization = `Bearer ${token}`;
    try {
      const response = await fetch(`${base}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      let parsed: Json = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as Json;
        } catch {
          parsed = {
            ok: false,
            error: 'The server returned an invalid response',
            code: 'BAD_RESPONSE',
          };
        }
      }
      return { ok: response.ok, body: parsed };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      log.warn(`LAN request failed (${method} ${pathname}): ${detail}`);
      return {
        ok: false,
        body: { ok: false, error: `Cannot reach the AnalytIQ server at ${base}`, code: 'NETWORK' },
      };
    }
  }

  ipcMain.handle('auth:status', async () => {
    const result = await request('GET', '/api/status', undefined, false);
    if (result.ok) return { setupComplete: result.body.setupComplete === true };
    return { setupComplete: false, error: result.body.error, code: result.body.code };
  });

  ipcMain.handle('auth:setup', async (_event, input: unknown) => {
    const result = await request('POST', '/api/setup', input, false);
    if (result.ok && result.body.ok) {
      log.info(
        `First-run setup completed on LAN server for business ${String(result.body.businessId)}`
      );
    }
    return result.body;
  });

  ipcMain.handle('auth:login', async (_event, input: unknown) => {
    const result = await request('POST', '/api/auth/login', input, false);
    if (!result.ok || !result.body.ok) return result.body;
    const issued = result.body.token;
    if (typeof issued !== 'string' || issued.length === 0) {
      return { ok: false, error: 'The server did not issue a session', code: 'BAD_RESPONSE' };
    }
    token = issued;
    persistToken(token);
    resetSocket();
    return { ok: true, user: result.body.user, expiresAt: result.body.expiresAt };
  });

  ipcMain.handle('auth:logout', async () => {
    const result = token
      ? await request('POST', '/api/auth/logout', undefined, true)
      : { ok: true, body: { ok: true } };
    token = null;
    persistToken(null);
    resetSocket();
    return result.body;
  });

  ipcMain.handle('auth:me', async () => {
    if (!token) return { user: null };
    const result = await request('GET', '/api/auth/me', undefined, true);
    if (result.ok) return { user: result.body.user ?? null };
    if (result.body.code === 'UNAUTHENTICATED') {
      token = null;
      persistToken(null);
      resetSocket();
      return { user: null };
    }
    return { user: null, error: result.body.error, code: result.body.code };
  });

  ipcMain.handle('auth:can-safestore', () => safeStorage.isEncryptionAvailable());

  // Backups live on the primary computer's disk; there is no folder to open
  // from a client machine.
  ipcMain.handle('backup:reveal', () => ({
    ok: false,
    error: 'Backups are stored on the primary computer',
    code: 'NOT_SUPPORTED',
  }));

  for (const [channel, route] of Object.entries(ROUTES)) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      try {
        const pathname = route.path(args);
        const body = route.body?.(args);
        const result = await request(route.method, pathname, body, true);
        if (result.body.code === 'UNAUTHENTICATED') {
          token = null;
          persistToken(null);
          resetSocket();
        }
        return { ...(route.fallback ?? {}), ...result.body };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Request failed';
        return { ...(route.fallback ?? {}), ok: false, error: message, code: 'VALIDATION' };
      }
    });
  }
}
