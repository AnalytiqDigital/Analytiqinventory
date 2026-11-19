import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import {
  adjustStock,
  archiveCustomer,
  archiveProduct,
  archiveSupplier,
  cancelPurchase,
  createBackup,
  createCustomer,
  createLocation,
  createPurchase,
  createSupplier,
  deleteBackup,
  getAutomationSettings,
  getCustomer,
  getSyncStatus,
  httpTransport,
  listAutomationMessages,
  listBackups,
  listCustomerPayments,
  listCustomers,
  listLocations,
  listPurchases,
  listSuppliers,
  receivePurchase,
  recordCustomerPayment,
  requirePermission,
  restoreBackup,
  runAutomation,
  runDailyBackupIfDue,
  sendTestMessage,
  setAutomationSettings,
  toAutomationView,
  updateCustomer,
  updateSupplier,
  authenticate,
  countStock,
  createCategory,
  createExpense,
  createProduct,
  createSale,
  createStaff,
  createTable,
  createTaxCategory,
  deleteExpense,
  getLevels,
  getProduct,
  getBusinessProfile,
  getReportsSummary,
  getSale,
  importProducts,
  importPurchases,
  importSales,
  productByBarcode,
  deleteTable,
  ensureDefaultTaxCategory,
  isFirstRun,
  listCategories,
  listExpenses,
  listMovements,
  listProducts,
  listRoles,
  listSales,
  listStaff,
  listTables,
  listTaxCategories,
  login,
  logout,
  refundSale,
  resetStaffPassword,
  restoreProduct,
  runSetup,
  setSyncSettings,
  setTableStatus,
  syncNow,
  updateLocation,
  updateProduct,
  updateRolePermissions,
  updateStaff,
  updateTable,
  updateTaxCategory,
  voidSale,
  type LocalDb,
} from '@analytiq/database';
import { activateLicense, getLicenseStatus } from '@analytiq/licensing';
import path from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import log from 'electron-log';
import { registerLanClient } from './lanClient';
import { registerPrinterHandlers } from './printer';
import { registerUpdateHandlers } from './updates';

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
async function authenticateSession(): Promise<{
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

// Every business handler goes through here, so an unlicensed copy can still
// sign in and activate but cannot read or write business data.
async function requireUser(): Promise<{
  db: LocalDb;
  user: { id: string; businessId: string; permissions: string[] };
}> {
  const session = await authenticateSession();
  const status = getLicenseStatus(session.db);
  if (!status.usable) {
    throw Object.assign(new Error(status.reason ?? 'This copy needs a license key'), {
      code: 'LICENSE_REQUIRED',
    });
  }
  return session;
}

// Licensing itself must work without a usable license: status always, activate
// for admins. Both authenticate the session directly.
function licenseHandlers(): void {
  ipcMain.handle('license:status', async () => {
    try {
      const { db } = await authenticateSession();
      return { ok: true, status: getLicenseStatus(db) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('license:activate', async (_event, key: unknown) => {
    try {
      const { db, user } = await authenticateSession();
      requirePermission(new Set(user.permissions), 'settings.manage');
      if (typeof key !== 'string' || key.trim().length === 0) {
        throw Object.assign(new Error('Paste a license key'), { code: 'LICENSE_INVALID' });
      }
      return {
        ok: true,
        status: activateLicense(db, key, {
          actor: { userId: user.id, businessId: user.businessId },
        }),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
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

  ipcMain.handle('inventory:product-by-barcode', async (_event, code: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof code !== 'string' || code.trim().length === 0) {
        throw Object.assign(new Error('Scan or type a barcode'), { code: 'INVALID_SCAN' });
      }
      return { ok: true, product: await productByBarcode(db, user.businessId, code) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), product: null };
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

  // --- Batch 9: reports and BI. Read-only aggregates derived from the ledger;
  // requires reports.view, enforced inside the service.
  ipcMain.handle('reports:summary', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        summary: getReportsSummary(db, user.businessId, user.permissions, query ?? {}),
      };
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

// --- Batch 8: locations + hub sync. Settings live per business and require
// settings.manage, mirroring the LAN server. Sync runs against the uplink the
// owner configured; sales and purchases stay on the till that recorded them.
function firstBusinessId(db: LocalDb): string | null {
  const row = db.raw.prepare('SELECT id FROM businesses ORDER BY rowid LIMIT 1').get() as
    { id: string } | undefined;
  return row?.id ?? null;
}

function locationHandlers(): void {
  ipcMain.handle('locations:list', async () => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, items: await listLocations(db, user.businessId) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('locations:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        location: await createLocation(db, user.businessId, user.id, user.permissions, input),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('locations:update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id: string; patch: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Location id is required');
      return {
        ok: true,
        location: await updateLocation(db, user.businessId, user.id, user.permissions, id, patch),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

function syncHandlers(): void {
  ipcMain.handle('sync:status', async () => {
    try {
      const { db, user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      return { ok: true, status: getSyncStatus(db, user.businessId) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('sync:configure', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        settings: setSyncSettings(db, user.businessId, user.id, user.permissions, input),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('sync:now', async () => {
    try {
      const { db, user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      const { settings } = getSyncStatus(db, user.businessId);
      if (!settings.enabled) {
        throw Object.assign(new Error('Sync is turned off'), { code: 'SYNC_DISABLED' });
      }
      const result = await syncNow(db, user.businessId, httpTransport(settings.url, settings.key));
      return result;
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

function startSyncScheduler(db: LocalDb): void {
  const run = async (): Promise<void> => {
    try {
      if (await isFirstRun(db)) return;
      const businessId = firstBusinessId(db);
      if (!businessId) return;
      const { settings } = getSyncStatus(db, businessId);
      if (!settings.enabled || !settings.url || !settings.key) return;
      const result = await syncNow(db, businessId, httpTransport(settings.url, settings.key));
      log.info(`Sync finished: ${result.pushed} pushed, ${result.pulled} pulled`);
    } catch (err: unknown) {
      log.warn(`Background sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setTimeout(() => void run(), 45_000).unref?.();
  const timer = setInterval(() => void run(), 5 * 60 * 1000);
  timer.unref?.();
}

// --- Batch 11: automation. Same contract as the LAN server: stored secrets are
// never returned to the renderer, only whether one is saved.
function automationHandlers(): void {
  ipcMain.handle('automation:settings', async () => {
    try {
      const { db, user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      return { ok: true, settings: toAutomationView(getAutomationSettings(db, user.businessId)) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('automation:save', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        settings: toAutomationView(
          setAutomationSettings(db, user.businessId, user.id, user.permissions, input)
        ),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('automation:messages', async (_event, limit: unknown) => {
    try {
      const { db, user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      return {
        ok: true,
        messages: await listAutomationMessages(
          db,
          user.businessId,
          typeof limit === 'number' ? limit : 50
        ),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), messages: [] };
    }
  });

  ipcMain.handle('automation:test', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const message = await sendTestMessage(
        db,
        user.businessId,
        user.id,
        user.permissions,
        input ?? {}
      );
      return { ok: true, message };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('automation:run', async () => {
    try {
      const { db, user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      return { ok: true, result: await runAutomation(db, user.businessId, { force: true }) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

function startAutomationScheduler(db: LocalDb): void {
  const run = async (): Promise<void> => {
    try {
      if (await isFirstRun(db)) return;
      const businessId = firstBusinessId(db);
      if (!businessId) return;
      const result = await runAutomation(db, businessId);
      if (result.queued > 0) {
        log.info(`Automation sent ${result.queued} message(s)`);
        mainWindow?.webContents.send('realtime:event', {
          type: 'automation.changed',
          payload: { reason: 'scheduled' },
        });
      }
    } catch (err: unknown) {
      log.warn(`Automation tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setTimeout(() => void run(), 90_000).unref?.();
  const timer = setInterval(() => void run(), 15 * 60 * 1000);
  timer.unref?.();
}

// --- Batch 12: local backups. Snapshots sit beside the database in userData;
// restore requires settings.manage and forces a fresh sign-in afterwards.
function backupDirectory(): string {
  return path.join(app.getPath('userData'), 'backups');
}

function backupHandlers(): void {
  ipcMain.handle('backup:list', async () => {
    try {
      const { user } = await requireUser();
      requirePermission(new Set(user.permissions), 'settings.manage');
      return { ok: true, dir: backupDirectory(), items: listBackups(backupDirectory()) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('backup:create', async () => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...createBackup(db, backupDirectory(), user.permissions, user.id, user.businessId),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('backup:restore', async (_event, name: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = restoreBackup(
        db,
        dbPath(),
        backupDirectory(),
        user.permissions,
        user.id,
        user.businessId,
        name
      );
      // Sessions live in the database that was just replaced.
      currentToken = null;
      mainWindow?.webContents.reload();
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('backup:delete', async (_event, name: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...deleteBackup(db, backupDirectory(), user.permissions, user.id, user.businessId, name),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('backup:reveal', async () => {
    try {
      const dir = backupDirectory();
      mkdirSync(dir, { recursive: true });
      const problem = await shell.openPath(dir);
      if (problem) return { ok: false, error: problem, code: 'OPEN_FAILED' };
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

// Business identity for receipt headers (name, address, phone, tax label).
function businessHandlers(): void {
  ipcMain.handle('business:profile', async () => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, business: await getBusinessProfile(db, user.businessId) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), business: null };
    }
  });
}

// Bulk CSV import. The renderer parses + converts naira to kobo; the service
// validates every row again and returns per-row diagnostics.
function importHandlers(): void {
  ipcMain.handle('import:products', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...(await importProducts(db, user.businessId, user.id, user.permissions, input)),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), created: 0, failed: 0, errors: [] };
    }
  });

  ipcMain.handle('import:purchases', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...(await importPurchases(db, user.businessId, user.id, user.permissions, input)),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), created: 0, failed: 0, errors: [] };
    }
  });

  ipcMain.handle('import:sales', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...(await importSales(db, user.businessId, user.id, user.permissions, input)),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), created: 0, failed: 0, errors: [] };
    }
  });
}

// Batch 14: staff accounts, editable role permissions and the expenses ledger.
function staffFinanceHandlers(): void {
  ipcMain.handle('staff:list', async () => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, ...(await listStaff(db, user.businessId, user.permissions)) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('staff:create', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      const result = await createStaff(db, user.businessId, user.id, user.permissions, input);
      return { ok: true, ...result };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('staff:update', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, patch } = payload as { id?: unknown; patch?: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Staff id is required');
      return {
        ok: true,
        ...(await updateStaff(db, user.businessId, user.id, user.permissions, id, patch)),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('staff:reset-password', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, password } = payload as { id?: unknown; password?: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Staff id is required');
      await resetStaffPassword(db, user.businessId, user.id, user.permissions, id, { password });
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('staff:roles', async () => {
    try {
      const { db, user } = await requireUser();
      return { ok: true, ...(await listRoles(db, user.businessId, user.permissions)) };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [] };
    }
  });

  ipcMain.handle('staff:role-permissions', async (_event, payload: unknown) => {
    try {
      const { db, user } = await requireUser();
      const { id, permissions } = payload as { id?: unknown; permissions?: unknown };
      if (typeof id !== 'string' || id.length === 0) throw new Error('Role id is required');
      return {
        ok: true,
        ...(await updateRolePermissions(db, user.businessId, user.id, user.permissions, id, {
          permissions,
        })),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('finance:expenses', async (_event, query: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...(await listExpenses(db, user.businessId, user.permissions, query ?? {})),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err), items: [], totalKobo: 0 };
    }
  });

  ipcMain.handle('finance:create-expense', async (_event, input: unknown) => {
    try {
      const { db, user } = await requireUser();
      return {
        ok: true,
        ...(await createExpense(db, user.businessId, user.id, user.permissions, input)),
      };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });

  ipcMain.handle('finance:delete-expense', async (_event, id: unknown) => {
    try {
      const { db, user } = await requireUser();
      if (typeof id !== 'string' || id.length === 0) throw new Error('Expense id is required');
      await deleteExpense(db, user.businessId, user.id, user.permissions, id);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, ...safeError(err) };
    }
  });
}

function startBackupScheduler(db: LocalDb): void {
  const dir = backupDirectory();
  const run = async (): Promise<void> => {
    try {
      if (await isFirstRun(db)) return;
      const result = runDailyBackupIfDue(db, dir, 14);
      if (result) log.info(`Daily backup written: ${result.backup.name}`);
    } catch (err: unknown) {
      log.warn(`Automatic backup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setTimeout(() => void run(), 30_000).unref?.();
  const timer = setInterval(() => void run(), 60 * 60 * 1000);
  timer.unref?.();
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
  registerUpdateHandlers();
  // Printing is local hardware: register it in both primary and LAN client
  // mode so every till prints on the printer attached to it.
  registerPrinterHandlers();
  const lanServerUrl = resolveLanServerUrl();
  if (lanServerUrl) {
    log.info(`LAN client mode: ${lanServerUrl}`);
    registerLanClient(lanServerUrl);
  } else {
    try {
      const db = await ensureDb();
      startBackupScheduler(db);
      startSyncScheduler(db);
      startAutomationScheduler(db);
    } catch (err: unknown) {
      log.error(`Database init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    localAuthHandlers();
    licenseHandlers();
    inventoryHandlers();
    locationHandlers();
    syncHandlers();
    automationHandlers();
    backupHandlers();
    businessHandlers();
    importHandlers();
    staffFinanceHandlers();
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
