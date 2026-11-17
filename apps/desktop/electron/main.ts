import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import {
  adjustStock,
  archiveCustomer,
  archiveProduct,
  archiveSupplier,
  cancelPurchase,
  createCustomer,
  createPurchase,
  createSupplier,
  getCustomer,
  listCustomerPayments,
  listCustomers,
  listPurchases,
  listSuppliers,
  receivePurchase,
  recordCustomerPayment,
  updateCustomer,
  updateSupplier,
  authenticate,
  countStock,
  createCategory,
  createProduct,
  createSale,
  createTable,
  createTaxCategory,
  getLevels,
  getProduct,
  getSale,
  deleteTable,
  ensureDefaultTaxCategory,
  isFirstRun,
  listCategories,
  listMovements,
  listProducts,
  listSales,
  listTables,
  listTaxCategories,
  login,
  logout,
  refundSale,
  restoreProduct,
  runSetup,
  setTableStatus,
  updateProduct,
  updateTable,
  updateTaxCategory,
  voidSale,
  type LocalDb,
} from '@analytiq/database';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import log from 'electron-log';
import { registerLanClient } from './lanClient';

log.initialize();
log.transports.file.level = 'info';
log.info('AnalytIQ Inventory starting');

let mainWindow: BrowserWindow | null = null;
let local: LocalDb | null = null;
// Session token lives only in main-process memory: never exposed to the
// renderer, never written to disk. Restarting the app requires login again.
let currentToken: string | null = null;

const ALLOWED_LOG_LEVELS = new Set(['info', 'warn', 'error']);

function dbPath(): string {
  if (process.env.ANALYTIQ_DB_PATH) return process.env.ANALYTIQ_DB_PATH;
  return path.join(app.getPath('userData'), 'local.db');
}

async function ensureDb(): Promise<LocalDb> {
  if (local) return local;
  const { openLocalDb, runMigrations } = await import('@analytiq/database');
  runMigrations(dbPath());
  local = openLocalDb(dbPath());
  return local;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function safeError(err: unknown): { error: string; code?: string } {
  const message = err instanceof Error ? err.message : 'Unexpected error';
  const code =
    err instanceof Error && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
      ? (err as unknown as { code: string }).code
      : undefined;
  log.warn(`IPC error (${code ?? 'UNKNOWN'}): ${message.slice(0, 200)}`);
  return { error: message, code };
}

// Allow-listed IPC only. Payloads are validated with Zod inside the service
// layer; the renderer never touches the database file directly.
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:ping', () => 'pong');
ipcMain.handle('app:log', (_event, level: unknown, message: unknown) => {
  if (typeof level !== 'string' || !ALLOWED_LOG_LEVELS.has(level)) return;
  if (typeof message !== 'string' || message.length === 0 || message.length > 2000) return;
  if (level === 'error') log.error(`[renderer] ${message}`);
  else if (level === 'warn') log.warn(`[renderer] ${message}`);
  else log.info(`[renderer] ${message}`);
});

function localAuthHandlers(): void {
  ipcMain.handle('auth:status', async () => {
    try {
      const db = await ensureDb();
      return { setupComplete: !(await isFirstRun(db)) };
    } catch (err: unknown) {
      return { ...safeError(err), setupComplete: false };
    }
  });

  ipcMain.handle('auth:setup', async (_event, input: unknown) => {
    try {
      const db = await ensureDb();
      const result = await runSetup(db, input);
      log.info(`First-run setup completed for business ${result.businessId}`);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('auth:login', async (_event, input: unknown) => {
    try {
      const db = await ensureDb();
      const result = await login(db, input);
      currentToken = result.token;
      return { ok: true, user: result.user, expiresAt: result.expiresAt.toISOString() };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      if (currentToken) {
        const db = await ensureDb();
        await logout(db, currentToken);
        currentToken = null;
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('auth:me', async () => {
    try {
      if (!currentToken) return { user: null };
      const db = await ensureDb();
      const user = await authenticate(db, currentToken);
      return { user };
    } catch (err: unknown) {
      return { ...safeError(err), user: null };
    }
  });

  ipcMain.handle('auth:can-safestore', () => safeStorage.isEncryptionAvailable());
}

// --- Batch 4: products + inventory. Every write is validated with Zod in the
// service layer and requires the caller's session permissions; reads need an
// authenticated session. The renderer never touches the DB file.
async function requireUser(): Promise<{
  db: LocalDb;
  user: { id: string; businessId: string; permissions: string[] };
}> {
  if (!currentToken) throw Object.assign(new Error('Not signed in'), { code: 'UNAUTHENTICATED' });
  const db = await ensureDb();
  const user = await authenticate(db, currentToken);
  if (!user)
    throw Object.assign(new Error('Session expired — sign in again'), { code: 'UNAUTHENTICATED' });
  return { db, user };
}

function inventoryHandlers(): void {
  ipcMain.handle('inventory:categories', async () => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, items: await listCategories(db, user.businessId) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:category-create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const category = await createCategory(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, category };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:products', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listProducts(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('inventory:product-get', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Product id is required');
      return { ok: true, product: await getProduct(db, user.businessId, id) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:product-create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createProduct(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:product-update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Product id is required');
      await updateProduct(db, user.businessId, user.id, user.permissions, id, patch);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:product-archive', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Product id is required');
      await archiveProduct(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:product-restore', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Product id is required');
      await restoreProduct(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:levels', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await getLevels(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('inventory:adjust', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await adjustStock(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:count', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await countStock(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:movements', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listMovements(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  // --- Batch 5: POS + cash register. Same session-gated, permission-checked
  // pattern: sales.create for checkout, sales.refund for refunds/voids,
  // sales.view for history/detail.
  ipcMain.handle('sales:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createSale(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('sales:list', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listSales(db, user.businessId, user.permissions, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('sales:get', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Sale id is required');
      return { ok: true, sale: await getSale(db, user.businessId, user.permissions, id) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('sales:refund', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, input } = payload as { id: string; input: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Sale id is required');
      await refundSale(db, user.businessId, user.id, user.permissions, id, input);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('sales:void', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, input } = payload as { id: string; input: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Sale id is required');
      await voidSale(db, user.businessId, user.id, user.permissions, id, input);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
  // --- Restaurant pack: tax categories + dining tables. Same session-gated,
  // permission-checked pattern as above.
  ipcMain.handle('inventory:tax-categories', async () => {
    try {
      const { db, user } = await requireUser();
      const seeded = await ensureDefaultTaxCategory(db, user.businessId);
      const items = await listTaxCategories(db, user.businessId);
      return { ok: true, items, defaultId: seeded.id };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('inventory:tax-category-create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const category = await createTaxCategory(
        db,
        user.businessId,
        user.id,
        user.permissions,
        input
      );
      return { ok: true, category };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('inventory:tax-category-update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Tax category id is required');
      const category = await updateTaxCategory(
        db,
        user.businessId,
        user.id,
        user.permissions,
        id,
        patch
      );
      return { ok: true, category };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  // --- Batch 6: customers, suppliers, purchasing ---
  ipcMain.handle('customers:list', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listCustomers(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('customers:get', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Customer id is required');
      const customer = await getCustomer(db, user.businessId, id);
      return { ok: true, customer };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('customers:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createCustomer(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('customers:update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Customer id is required');
      await updateCustomer(db, user.businessId, user.id, user.permissions, id, patch);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('customers:archive', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Customer id is required');
      await archiveCustomer(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('customers:payments', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Customer id is required');
      const items = await listCustomerPayments(db, user.businessId, id);
      return { ok: true, items };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('customers:payment', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await recordCustomerPayment(
        db,
        user.businessId,
        user.id,
        user.permissions,
        input
      );
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  // --- suppliers ---
  ipcMain.handle('suppliers:list', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listSuppliers(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('suppliers:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createSupplier(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('suppliers:update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Supplier id is required');
      await updateSupplier(db, user.businessId, user.id, user.permissions, id, patch);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('suppliers:archive', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Supplier id is required');
      await archiveSupplier(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  // --- purchasing ---
  ipcMain.handle('purchases:list', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await listPurchases(db, user.businessId, query ?? {});
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], total: 0 };
    }
  });

  ipcMain.handle('purchases:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createPurchase(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('purchases:receive', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Purchase id is required');
      const result = await receivePurchase(db, user.businessId, user.id, user.permissions, id);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('purchases:cancel', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Purchase id is required');
      await cancelPurchase(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('tables:list', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, items: await listTables(db, user.businessId, query ?? {}) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('tables:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const table = await createTable(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, table };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('tables:update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Table id is required');
      const table = await updateTable(db, user.businessId, user.id, user.permissions, id, patch);
      return { ok: true, table };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('tables:set-status', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, input } = payload as { id: string; input: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Table id is required');
      const table = await setTableStatus(db, user.businessId, user.id, user.permissions, id, input);
      return { ok: true, table };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('tables:delete', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Table id is required');
      await deleteTable(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

// Client mode is configured per install: ANALYTIQ_SERVER_URL wins, then
// `server.json` ({ "serverUrl": "http://192.168.1.10:3001" }) beside the
// executable or in the userData folder. Without any of these, the app runs as
// the primary with its embedded SQLite file.
function resolveLanServerUrl(): string | null {
  const fromEnv = process.env.ANALYTIQ_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), 'server.json'),
    path.join(app.getPath('userData'), 'server.json'),
  ];
  for (const configPath of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as { serverUrl?: unknown };
      if (typeof parsed.serverUrl === 'string' && parsed.serverUrl.trim().length > 0) {
        return parsed.serverUrl.trim().replace(/\/+$/, '');
      }
    } catch {
      // Missing or malformed config at this location; try the next one.
    }
  }
  return null;
}

void app.whenReady().then(async () => {
  const lanServerUrl = resolveLanServerUrl();
  if (lanServerUrl) {
    log.info(`LAN client mode: ${lanServerUrl}`);
    registerLanClient(lanServerUrl);
  } else {
    try {
      await ensureDb();
    } catch (err: unknown) {
      log.error(`Database init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    localAuthHandlers();
    inventoryHandlers();
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
