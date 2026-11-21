import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Server as SocketIOServer } from 'socket.io';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import {
  adjustAccount,
  adjustLoyalty,
  adjustStock,
  addCustomerNote,
  archiveCustomer,
  archiveProduct,
  archiveSupplier,
  authenticate,
  backupDirFor,
  cancelPurchase,
  closeLocalDb,
  cloudBackupView,
  countStock,
  createAccount,
  createBackup,
  createBatchIntake,
  createBrand,
  createCategory,
  createCustomer,
  createCustomerGroup,
  createExpense,
  createLocation,
  createPriceTier,
  createProduct,
  createPurchase,
  createPurchaseReturn,
  createSale,
  createSaleReturn,
  createStaff,
  createStockAdjustment,
  createStockTransfer,
  createSupplier,
  createTable,
  createTaxCategory,
  createUnit,
  createWarranty,
  customerVisitSummary,
  deleteBackup,
  deleteExpense,
  deletePriceTier,
  deleteTable,
  ensureDefaultTaxCategory,
  getAutomationSettings,
  getBusinessProfile,
  getCloudBackupSettings,
  getCustomer,
  getLevels,
  getLoyaltySettings,
  getMenuReports,
  getModuleInstallView,
  getPaymentMap,
  getProduct,
  getReportsSummary,
  getRestaurantSettings,
  getSale,
  getSyncStatus,
  httpTransport,
  importProducts,
  importPurchases,
  importSales,
  importOpeningStock,
  importContacts,
  ingestRecords,
  isFirstRun,
  isSyncEntity,
  listAccountTransactions,
  listAccounts,
  listAutomationMessages,
  listBackups,
  listBatches,
  listBrands,
  listCategories,
  listCloudUploads,
  listCustomerGroups,
  listCustomerNotes,
  listCustomerPayments,
  listCustomers,
  listDebtors,
  listExpenses,
  listExpiryAlerts,
  listLocations,
  listLoyaltyEntries,
  listMovements,
  listPriceTiers,
  listProducts,
  listPurchases,
  listPurchaseReturns,
  listRecordsSince,
  listRoles,
  listSaleReturns,
  listSales,
  listStaff,
  listStockAdjustments,
  listStockTransfers,
  listSuppliers,
  listTables,
  listTaxCategories,
  listTierPrices,
  listUnits,
  listWarranties,
  login,
  logout,
  lookupSaleByReceipt,
  openLocalDb,
  productByBarcode,
  recordCustomerPayment,
  receivePurchase,
  refundSale,
  requirePermission,
  resetStaffPassword,
  restoreBackup,
  restoreProduct,
  runAutomation,
  runDailyBackupIfDue,
  runEncryptedCloudBackup,
  runMigrations,
  runSetup,
  sendDebtorReminders,
  sendTestMessage,
  setAutomationSettings,
  setCloudBackupSettings,
  setLoyaltySettings,
  setModuleInstall,
  setPaymentMap,
  setRestaurantSettings,
  setTableStatus,
  setSyncSettings,
  setTierPrices,
  syncNow,
  toAutomationView,
  transferBetweenAccounts,
  updateAccount,
  updateBrand,
  updateCategory,
  updateCustomer,
  updateCustomerGroup,
  updateExpense,
  updateLocation,
  updatePriceTier,
  updateProduct,
  updateRolePermissions,
  updateStaff,
  updateSupplier,
  updateTable,
  updateTaxCategory,
  updateUnit,
  updateWarranty,
  voidSale,
  type AuthenticatedUser,
  type LocalDb,
} from '@analytiq/database';
import {
  activateLicenseOnline,
  deactivateLicenseOnline,
  getLicenseStatus,
  LICENSE_PUBLIC_KEY,
} from '@analytiq/licensing';

declare module 'fastify' {
  interface FastifyInstance {
    db: LocalDb;
    realtime: RealtimeHub;
    backupsDir: string;
    licensePublicKey: string;
    syncKey: string;
  }
  interface FastifyRequest {
    user: AuthenticatedUser | null;
    token: string;
  }
}

export interface ServerOptions {
  dbPath?: string;
  logger?: boolean;
  tls?: { key: string | Buffer; cert: string | Buffer };
  /** Overrides the embedded vendor public key; used by tests and white-label builds. */
  licensePublicKey?: string;
  /** Website origin that records first-use activation; defaults to the public site. */
  activationUrl?: string;
  /** Shared secret branches present on every /sync call. Empty disables sync. */
  syncKey?: string;
}

interface StartOptions {
  port?: number;
  host?: string;
}

export function businessRoom(businessId: string): string {
  return `business:${businessId}`;
}

// Routes that must keep working without a usable license: signing out, session
// refresh, and licensing itself (otherwise an expired copy could never be
// activated).
const LICENSE_EXEMPT = new Set([
  '/api/auth/logout',
  '/api/auth/me',
  '/api/license/status',
  '/api/license/activate',
  '/api/license/deactivate',
]);

// Per-IP throttle in front of password checks. The database already locks an
// account after repeated failures; this stops a caller from spraying many
// accounts from one machine.
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;

/** Realtime fan-out. No-op until Socket.IO is attached on listen. */
export class RealtimeHub {
  private io: SocketIOServer | null = null;

  attach(io: SocketIOServer): void {
    this.io = io;
  }

  emit(businessId: string, event: string, payload: unknown): void {
    this.io?.to(businessRoom(businessId)).emit(event, payload);
  }
}

function dbPathOf(options: ServerOptions): string {
  return options.dbPath ?? process.env.ANALYTIQ_DB_PATH ?? join(process.cwd(), 'data', 'local.db');
}

// Route payloads mirror the desktop IPC result shapes so the same renderer
// code works against an embedded DB or a LAN server without translation.
function httpStatusFor(code: string | undefined): number {
  if (!code) return 400;
  if (code === 'UNAUTHENTICATED' || code === 'SYNC_UNAUTHORIZED') return 401;
  if (code === 'FORBIDDEN' || code === 'LICENSE_REQUIRED') return 403;
  if (code === 'ACCOUNT_LOCKED') return 423;
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'SYNC_NOT_CONFIGURED') return 503;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (code.endsWith('_EXISTS') || code === 'ALREADY_SETUP' || code === 'TAX_CATEGORY_EXISTS') {
    return 409;
  }
  return 400;
}

/** Constant-time secret comparison; hashing first removes the length leak. */
function secretEquals(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function zodMessage(err: Error): string | null {
  if (err.name !== 'ZodError') return null;
  const issues = (err as unknown as { issues?: Array<{ message?: string }> }).issues;
  return issues?.[0]?.message ?? 'Invalid request';
}

function queryOf(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
}

function boolQuery(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}

function userIdOf(request: FastifyRequest): { user: AuthenticatedUser; db: LocalDb } {
  const user = request.user;
  if (!user) {
    const err = new Error('Not signed in');
    (err as NodeJS.ErrnoException).code = 'UNAUTHENTICATED';
    throw err;
  }
  return { user, db: request.server.db };
}

const SYNC_MAX_BATCH = 500;

/** The relay always speaks for the single business hosted on this machine. */
function hubBusinessId(local: LocalDb): string {
  const row = local.raw.prepare('SELECT id FROM businesses ORDER BY rowid LIMIT 1').get() as
    { id: string } | undefined;
  if (!row) {
    const err = new Error('This server has no business set up yet');
    (err as NodeJS.ErrnoException).code = 'SYNC_NOT_CONFIGURED';
    throw err;
  }
  return row.id;
}

function syncInvalid(message: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = 'SYNC_INVALID';
  return err;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    ...(options.tls ? { https: options.tls } : {}),
  });

  const file = dbPathOf(options);
  runMigrations(file);
  const db = openLocalDb(file);

  app.decorate('db', db);
  app.decorate('realtime', new RealtimeHub());
  app.decorate('backupsDir', backupDirFor(file));
  app.decorate('licensePublicKey', options.licensePublicKey ?? LICENSE_PUBLIC_KEY);
  app.decorate('syncKey', options.syncKey ?? process.env.ANALYTIQ_SYNC_KEY ?? '');
  app.decorateRequest('user', null);
  app.decorateRequest('token', '');
  app.addHook('onClose', async () => {
    closeLocalDb(db);
  });

  const loginAttempts = new Map<string, number[]>();
  function checkLoginRate(ip: string): void {
    const nowMs = Date.now();
    const recent = (loginAttempts.get(ip) ?? []).filter((t) => nowMs - t < LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_MAX_ATTEMPTS) {
      loginAttempts.set(ip, recent);
      const err = new Error('Too many sign-in attempts. Try again in a minute.');
      (err as NodeJS.ErrnoException).code = 'RATE_LIMITED';
      throw err;
    }
    recent.push(nowMs);
    loginAttempts.set(ip, recent);
  }

  void app.register(swagger, {
    openapi: { info: { title: 'AnalytIQ Local Server', version: '0.1.0' } },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((err, request, reply) => {
    const message = zodMessage(err) ?? err.message;
    const code = (err as NodeJS.ErrnoException).code;
    if (zodMessage(err)) {
      void reply.code(400).send({ ok: false, error: message, code: 'VALIDATION' });
      return;
    }
    request.log.warn(`API error (${code ?? 'UNKNOWN'}): ${message}`);
    void reply.code(httpStatusFor(code)).send({ ok: false, error: message, code });
  });

  app.get('/health', async () => ({ status: 'ok', mode: 'lan' }));

  void app.register(
    async (scope) => {
      scope.get('/status', async () => ({ setupComplete: !(await isFirstRun(scope.db)) }));

      scope.post('/setup', async (request) => {
        const result = await runSetup(scope.db, request.body ?? {});
        return { ok: true, ...result };
      });

      scope.post('/auth/login', async (request) => {
        checkLoginRate(request.ip);
        const result = await login(scope.db, request.body ?? {});
        return {
          ok: true,
          token: result.token,
          user: result.user,
          expiresAt: result.expiresAt.toISOString(),
        };
      });
    },
    { prefix: '/api' }
  );

  void app.register(
    async (scope) => {
      scope.addHook('preHandler', async (request) => {
        const header = request.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
        const user = token ? await authenticate(scope.db, token) : null;
        request.user = user;
        if (!user) {
          const err = new Error('Session expired — sign in again');
          (err as NodeJS.ErrnoException).code = 'UNAUTHENTICATED';
          throw err;
        }
        request.token = token;

        const path = request.url.split('?')[0] ?? '';
        if (LICENSE_EXEMPT.has(path)) return;
        const status = getLicenseStatus(scope.db, { publicKey: scope.licensePublicKey });
        if (!status.usable) {
          const err = new Error(status.reason ?? 'This copy needs a license key');
          (err as NodeJS.ErrnoException).code = 'LICENSE_REQUIRED';
          throw err;
        }
      });

      scope.post('/auth/logout', async (request) => {
        if (request.token) await logout(scope.db, request.token);
        return { ok: true };
      });

      scope.get('/auth/me', async (request) => {
        const { user } = userIdOf(request);
        return { ok: true, user };
      });

      scope.get('/license/status', async (request) => {
        const { db: local } = userIdOf(request);
        return {
          ok: true,
          status: getLicenseStatus(local, { publicKey: scope.licensePublicKey }),
        };
      });

      scope.post('/license/activate', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        const { key } = (request.body ?? {}) as { key?: unknown };
        if (typeof key !== 'string' || key.trim().length === 0) {
          const err = new Error('Paste a license key');
          (err as NodeJS.ErrnoException).code = 'LICENSE_INVALID';
          throw err;
        }
        return {
          ok: true,
          status: await activateLicenseOnline(local, key, {
            publicKey: scope.licensePublicKey,
            actor: { userId: user.id, businessId: user.businessId },
            serverUrl: options.activationUrl,
          }),
        };
      });

      scope.post('/license/deactivate', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        await deactivateLicenseOnline(local, {
          publicKey: scope.licensePublicKey,
          serverUrl: options.activationUrl,
        });
        return {
          ok: true,
          status: getLicenseStatus(local, { publicKey: scope.licensePublicKey }),
        };
      });

      // --- products + inventory ---
      scope.get('/categories', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, items: await listCategories(local, user.businessId) };
      });

      scope.post('/categories', async (request) => {
        const { user, db: local } = userIdOf(request);
        const category = await createCategory(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        return { ok: true, category };
      });

      scope.patch<{ Params: { id: string } }>('/categories/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        const category = await updateCategory(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        return { ok: true, category };
      });

      scope.get('/products', async (request) => {
        const { user, db: local } = userIdOf(request);
        const raw = queryOf(request.query);
        const query = { ...raw, includeInactive: boolQuery(raw.includeInactive) };
        return { ok: true, ...(await listProducts(local, user.businessId, query)) };
      });

      scope.get<{ Querystring: { code?: string } }>('/products/by-barcode', async (request) => {
        const { user, db: local } = userIdOf(request);
        const code = typeof request.query.code === 'string' ? request.query.code : '';
        if (!code.trim())
          throw Object.assign(new Error('Scan or type a barcode'), { code: 'INVALID_SCAN' });
        return { ok: true, product: await productByBarcode(local, user.businessId, code) };
      });

      scope.get<{ Params: { id: string } }>('/products/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, product: await getProduct(local, user.businessId, request.params.id) };
      });

      scope.post('/products', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createProduct(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'product.created',
          id: result.id,
        });
        return { ok: true, ...result };
      });

      scope.patch<{ Params: { id: string } }>('/products/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await updateProduct(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'product.updated',
          id: request.params.id,
        });
        return { ok: true };
      });

      scope.post<{ Params: { id: string } }>('/products/:id/archive', async (request) => {
        const { user, db: local } = userIdOf(request);
        await archiveProduct(local, user.businessId, user.id, user.permissions, request.params.id);
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'product.archived',
          id: request.params.id,
        });
        return { ok: true };
      });

      scope.post<{ Params: { id: string } }>('/products/:id/restore', async (request) => {
        const { user, db: local } = userIdOf(request);
        await restoreProduct(local, user.businessId, user.id, user.permissions, request.params.id);
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'product.restored',
          id: request.params.id,
        });
        return { ok: true };
      });

      scope.get('/stock/levels', async (request) => {
        const { user, db: local } = userIdOf(request);
        const raw = queryOf(request.query);
        const query = { ...raw, lowOnly: boolQuery(raw.lowOnly) };
        return { ok: true, ...(await getLevels(local, user.businessId, query)) };
      });

      scope.post('/stock/adjust', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await adjustStock(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'stock.adjusted',
          productId: (request.body as { productId?: unknown })?.productId,
        });
        return { ok: true, ...result };
      });

      scope.post('/stock/count', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await countStock(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'stock.counted',
          productId: (request.body as { productId?: unknown })?.productId,
        });
        return { ok: true, ...result };
      });

      scope.get('/stock/movements', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listMovements(local, user.businessId, queryOf(request.query))),
        };
      });

      // --- POS ---
      scope.post('/sales', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createSale(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'sale.created', {
          id: result.id,
          receiptNo: result.receiptNo,
          totalKobo: result.totalKobo,
        });
        scope.realtime.emit(user.businessId, 'inventory.changed', { reason: 'sale.created' });
        return { ok: true, ...result };
      });

      scope.get('/sales', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listSales(local, user.businessId, user.permissions, queryOf(request.query))),
        };
      });

      scope.get<{ Params: { id: string } }>('/sales/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          sale: await getSale(local, user.businessId, user.permissions, request.params.id),
        };
      });

      scope.post<{ Params: { id: string } }>('/sales/:id/refund', async (request) => {
        const { user, db: local } = userIdOf(request);
        await refundSale(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'sale.updated', {
          id: request.params.id,
          status: 'refunded',
        });
        scope.realtime.emit(user.businessId, 'inventory.changed', { reason: 'sale.refunded' });
        return { ok: true };
      });

      scope.post<{ Params: { id: string } }>('/sales/:id/void', async (request) => {
        const { user, db: local } = userIdOf(request);
        await voidSale(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'sale.updated', {
          id: request.params.id,
          status: 'voided',
        });
        return { ok: true };
      });

      // --- restaurant pack ---
      scope.get('/tax-categories', async (request) => {
        const { user, db: local } = userIdOf(request);
        const seeded = await ensureDefaultTaxCategory(local, user.businessId);
        return {
          ok: true,
          items: await listTaxCategories(local, user.businessId),
          defaultId: seeded.id,
        };
      });

      scope.post('/tax-categories', async (request) => {
        const { user, db: local } = userIdOf(request);
        const category = await createTaxCategory(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        return { ok: true, category };
      });

      scope.patch<{ Params: { id: string } }>('/tax-categories/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        const category = await updateTaxCategory(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        return { ok: true, category };
      });

      scope.get('/tables', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          items: await listTables(local, user.businessId, queryOf(request.query)),
        };
      });

      scope.post('/tables', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          table: await createTable(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          ),
        };
      });

      scope.patch<{ Params: { id: string } }>('/tables/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          table: await updateTable(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {}
          ),
        };
      });

      scope.post<{ Params: { id: string } }>('/tables/:id/status', async (request) => {
        const { user, db: local } = userIdOf(request);
        const table = await setTableStatus(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'table.updated', {
          id: request.params.id,
          status: table.status,
        });
        return { ok: true, table };
      });

      scope.delete<{ Params: { id: string } }>('/tables/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await deleteTable(local, user.businessId, user.id, user.permissions, request.params.id);
        scope.realtime.emit(user.businessId, 'table.updated', {
          id: request.params.id,
          status: 'deleted',
        });
        return { ok: true };
      });

      // --- customers + credit ---
      scope.get('/customers', async (request) => {
        const { user, db: local } = userIdOf(request);
        const raw = queryOf(request.query);
        const query = { ...raw, includeInactive: boolQuery(raw.includeInactive) };
        return { ok: true, ...(await listCustomers(local, user.businessId, query)) };
      });

      scope.get<{ Params: { id: string } }>('/customers/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          customer: await getCustomer(local, user.businessId, request.params.id),
        };
      });

      scope.post('/customers', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createCustomer(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'customer.updated', { reason: 'created' });
        return { ok: true, ...result };
      });

      scope.patch<{ Params: { id: string } }>('/customers/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await updateCustomer(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'customer.updated', {
          id: request.params.id,
          reason: 'updated',
        });
        return { ok: true };
      });

      scope.post<{ Params: { id: string } }>('/customers/:id/archive', async (request) => {
        const { user, db: local } = userIdOf(request);
        await archiveCustomer(local, user.businessId, user.id, user.permissions, request.params.id);
        scope.realtime.emit(user.businessId, 'customer.updated', {
          id: request.params.id,
          reason: 'archived',
        });
        return { ok: true };
      });

      scope.get<{ Params: { id: string } }>('/customers/:id/payments', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          items: await listCustomerPayments(local, user.businessId, request.params.id),
        };
      });

      scope.post('/customers/payments', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await recordCustomerPayment(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'customer.updated', {
          id: (request.body as { customerId?: unknown })?.customerId,
          reason: 'payment',
        });
        return { ok: true, ...result };
      });

      // --- suppliers + purchasing ---
      scope.get('/suppliers', async (request) => {
        const { user, db: local } = userIdOf(request);
        const raw = queryOf(request.query);
        const query = { ...raw, includeInactive: boolQuery(raw.includeInactive) };
        return { ok: true, ...(await listSuppliers(local, user.businessId, query)) };
      });

      scope.post('/suppliers', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createSupplier(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.patch<{ Params: { id: string } }>('/suppliers/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await updateSupplier(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        return { ok: true };
      });

      scope.post<{ Params: { id: string } }>('/suppliers/:id/archive', async (request) => {
        const { user, db: local } = userIdOf(request);
        await archiveSupplier(local, user.businessId, user.id, user.permissions, request.params.id);
        return { ok: true };
      });

      scope.get('/purchases', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listPurchases(local, user.businessId, queryOf(request.query))),
        };
      });

      scope.post('/purchases', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createPurchase(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.post<{ Params: { id: string } }>('/purchases/:id/receive', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await receivePurchase(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'purchase.received',
          id: request.params.id,
        });
        return { ok: true, ...result };
      });

      scope.post<{ Params: { id: string } }>('/purchases/:id/cancel', async (request) => {
        const { user, db: local } = userIdOf(request);
        await cancelPurchase(local, user.businessId, user.id, user.permissions, request.params.id);
        return { ok: true };
      });

      // --- Batch 16: masters, stock adjustments, purchase returns ---
      scope.get<{ Params: { kind: string } }>('/masters/:kind', async (request) => {
        const { user, db: local } = userIdOf(request);
        const kind = request.params.kind;
        const items =
          kind === 'brands'
            ? await listBrands(local, user.businessId)
            : kind === 'units'
              ? await listUnits(local, user.businessId)
              : kind === 'warranties'
                ? await listWarranties(local, user.businessId)
                : kind === 'customer-groups'
                  ? await listCustomerGroups(local, user.businessId)
                  : null;
        if (!items) throw Object.assign(new Error('Unknown list type'), { code: 'NOT_FOUND' });
        return { ok: true, items };
      });

      scope.post<{ Params: { kind: string } }>('/masters/:kind', async (request) => {
        const { user, db: local } = userIdOf(request);
        const kind = request.params.kind;
        const input = request.body ?? {};
        const args = [local, user.businessId, user.id, user.permissions, input] as const;
        const item =
          kind === 'brands'
            ? await createBrand(...args)
            : kind === 'units'
              ? await createUnit(...args)
              : kind === 'warranties'
                ? await createWarranty(...args)
                : kind === 'customer-groups'
                  ? await createCustomerGroup(...args)
                  : null;
        if (!item) throw Object.assign(new Error('Unknown list type'), { code: 'NOT_FOUND' });
        return { ok: true, item };
      });

      scope.patch<{ Params: { kind: string; id: string } }>(
        '/masters/:kind/:id',
        async (request) => {
          const { user, db: local } = userIdOf(request);
          const kind = request.params.kind;
          const args = [
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {},
          ] as const;
          const item =
            kind === 'brands'
              ? await updateBrand(...args)
              : kind === 'units'
                ? await updateUnit(...args)
                : kind === 'warranties'
                  ? await updateWarranty(...args)
                  : kind === 'customer-groups'
                    ? await updateCustomerGroup(...args)
                    : null;
          if (!item) throw Object.assign(new Error('Unknown list type'), { code: 'NOT_FOUND' });
          return { ok: true, item };
        }
      );

      scope.get('/stock-adjustments', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listStockAdjustments(local, user.businessId, queryOf(request.query))),
        };
      });

      scope.post('/stock-adjustments', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createStockAdjustment(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'stock.adjustment',
          id: result.id,
        });
        return { ok: true, ...result };
      });

      scope.get('/purchase-returns', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listPurchaseReturns(local, user.businessId, queryOf(request.query))),
        };
      });

      scope.post('/purchase-returns', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createPurchaseReturn(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', {
          reason: 'purchase.return',
          id: result.id,
        });
        return { ok: true, ...result };
      });

      scope.get('/reports/summary', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          summary: getReportsSummary(
            local,
            user.businessId,
            user.permissions,
            queryOf(request.query)
          ),
        };
      });

      scope.get('/reports/menu', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          report: getMenuReports(local, user.businessId, user.permissions, queryOf(request.query)),
        };
      });

      // --- Batch 13: receipt header + bulk import ---
      scope.get('/business', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, business: await getBusinessProfile(local, user.businessId) };
      });

      scope.post('/import/products', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await importProducts(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        if (result.created > 0) {
          scope.realtime.emit(user.businessId, 'inventory.changed', {
            reason: 'import.products',
            count: result.created,
          });
        }
        return { ok: true, ...result };
      });

      scope.post('/import/purchases', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await importPurchases(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        if (result.created > 0) {
          scope.realtime.emit(user.businessId, 'inventory.changed', {
            reason: 'import.purchases',
            count: result.created,
          });
        }
        return { ok: true, ...result };
      });

      scope.post('/import/sales', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await importSales(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        if (result.created > 0) {
          scope.realtime.emit(user.businessId, 'sale.created', {
            reason: 'import.sales',
            count: result.created,
          });
          scope.realtime.emit(user.businessId, 'inventory.changed', {
            reason: 'import.sales',
            count: result.created,
          });
        }
        return { ok: true, ...result };
      });

      scope.post('/import/opening-stock', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await importOpeningStock(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        if (result.created > 0) {
          scope.realtime.emit(user.businessId, 'inventory.changed', {
            reason: 'import.opening-stock',
            count: result.created,
          });
        }
        return { ok: true, ...result };
      });

      scope.post('/import/contacts', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await importContacts(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      // --- Batch 14: staff, role permissions and expenses ---
      scope.get('/staff', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, ...(await listStaff(local, user.businessId, user.permissions)) };
      });

      scope.post('/staff', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createStaff(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.get('/staff/roles', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, ...(await listRoles(local, user.businessId, user.permissions)) };
      });

      scope.patch<{ Params: { id: string } }>('/staff/roles/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        const body = (request.body ?? {}) as { permissions?: unknown };
        return {
          ok: true,
          ...(await updateRolePermissions(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            { permissions: body.permissions }
          )),
        };
      });

      scope.patch<{ Params: { id: string } }>('/staff/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await updateStaff(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {}
          )),
        };
      });

      scope.post<{ Params: { id: string } }>('/staff/:id/password', async (request) => {
        const { user, db: local } = userIdOf(request);
        const body = (request.body ?? {}) as { password?: unknown };
        await resetStaffPassword(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          { password: body.password }
        );
        return { ok: true };
      });

      scope.get('/finance/expenses', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listExpenses(local, user.businessId, user.permissions, queryOf(request.query))),
        };
      });

      scope.post('/finance/expenses', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createExpense(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.patch<{ Params: { id: string } }>('/finance/expenses/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await updateExpense(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {}
          )),
        };
      });

      scope.delete<{ Params: { id: string } }>('/finance/expenses/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await deleteExpense(local, user.businessId, user.id, user.permissions, request.params.id);
        return { ok: true };
      });

      // --- Cash and bank ledgers, plus restaurant service settings ---
      scope.get('/accounts', async (request) => {
        const { user, db: local } = userIdOf(request);
        const query = queryOf(request.query) as { includeArchived?: unknown };
        return {
          ok: true,
          ...(await listAccounts(local, user.businessId, user.permissions, {
            includeArchived: Boolean(query.includeArchived),
          })),
        };
      });

      scope.post('/accounts', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createAccount(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.get('/accounts/transactions', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listAccountTransactions(
            local,
            user.businessId,
            user.permissions,
            queryOf(request.query)
          )),
        };
      });

      scope.get('/accounts/payment-map', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, map: getPaymentMap(local, user.businessId) };
      });

      scope.post('/accounts/payment-map', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await setPaymentMap(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.post('/accounts/transfer', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await transferBetweenAccounts(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.post('/accounts/adjust', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await adjustAccount(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.patch<{ Params: { id: string } }>('/accounts/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await updateAccount(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {}
          )),
        };
      });

      scope.get('/restaurant/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, settings: getRestaurantSettings(local, user.businessId) };
      });

      scope.post('/restaurant/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await setRestaurantSettings(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      // --- Batch 8: locations ---
      scope.get('/locations', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, items: await listLocations(local, user.businessId) };
      });

      scope.post('/locations', async (request) => {
        const { user, db: local } = userIdOf(request);
        const location = await createLocation(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'location.updated', {
          reason: 'created',
          id: location.id,
        });
        return { ok: true, location };
      });

      scope.patch<{ Params: { id: string } }>('/locations/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        const location = await updateLocation(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'location.updated', {
          reason: 'updated',
          id: location.id,
        });
        return { ok: true, location };
      });

      // Sync settings are stored in the hub's own database, so an admin on the
      // LAN configures the hub's uplink through the same API they already use.
      scope.get('/sync/status', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        return { ok: true, status: getSyncStatus(local, user.businessId) };
      });

      scope.post('/sync/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          settings: setSyncSettings(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          ),
        };
      });

      scope.post('/sync/now', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        const { settings } = getSyncStatus(local, user.businessId);
        if (!settings.enabled) {
          const err = new Error('Sync is turned off');
          (err as NodeJS.ErrnoException).code = 'SYNC_DISABLED';
          throw err;
        }
        const result = await syncNow(
          local,
          user.businessId,
          httpTransport(settings.url, settings.key)
        );
        scope.realtime.emit(user.businessId, 'sync.changed', { reason: 'pull' });
        return result;
      });

      // --- Batch 11: automation. Settings hold write-only secrets, so the GET
      // returns booleans instead of the WhatsApp token and AI key.
      scope.get('/automation/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        return {
          ok: true,
          settings: toAutomationView(getAutomationSettings(local, user.businessId)),
        };
      });

      scope.post('/automation/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          settings: toAutomationView(
            setAutomationSettings(
              local,
              user.businessId,
              user.id,
              user.permissions,
              request.body ?? {}
            )
          ),
        };
      });

      scope.get('/automation/messages', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        const limit = Number((request.query as { limit?: string })?.limit ?? 50);
        return {
          ok: true,
          messages: await listAutomationMessages(local, user.businessId, limit),
        };
      });

      scope.post('/automation/test', async (request) => {
        const { user, db: local } = userIdOf(request);
        const message = await sendTestMessage(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'automation.changed', { reason: 'test' });
        return { ok: true, message };
      });

      scope.post('/automation/run', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        const result = await runAutomation(local, user.businessId, { force: true });
        if (result.queued > 0) {
          scope.realtime.emit(user.businessId, 'automation.changed', { reason: 'run' });
        }
        return { ok: true, result };
      });

      // --- Batch 15: business pack (modules, batches, price lists, loyalty,
      // counter returns, transfers, debtors, encrypted offsite backup).
      scope.get('/modules', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, ...(await getModuleInstallView(local, user.businessId)) };
      });

      scope.post('/modules', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await setModuleInstall(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.get('/batches', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, ...(await listBatches(local, user.businessId, queryOf(request.query))) };
      });

      scope.post('/batches', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createBatchIntake(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', { reason: 'batch.intake' });
        return { ok: true, ...result };
      });

      scope.get('/batches/expiry-alerts', async (request) => {
        const { user, db: local } = userIdOf(request);
        const days = Number((request.query as { days?: string })?.days ?? 60);
        return {
          ok: true,
          items: await listExpiryAlerts(local, user.businessId, Number.isFinite(days) ? days : 60),
        };
      });

      scope.get('/price-tiers', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, items: await listPriceTiers(local, user.businessId) };
      });

      scope.post('/price-tiers', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await createPriceTier(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.patch<{ Params: { id: string } }>('/price-tiers/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await updatePriceTier(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        return { ok: true };
      });

      scope.delete<{ Params: { id: string } }>('/price-tiers/:id', async (request) => {
        const { user, db: local } = userIdOf(request);
        await deletePriceTier(local, user.businessId, user.id, user.permissions, request.params.id);
        return { ok: true };
      });

      scope.get<{ Params: { id: string } }>('/price-tiers/:id/prices', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, items: await listTierPrices(local, user.businessId, request.params.id) };
      });

      scope.put<{ Params: { id: string } }>('/price-tiers/:id/prices', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await setTierPrices(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.params.id,
            request.body ?? {}
          )),
        };
      });

      scope.get('/loyalty/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, settings: getLoyaltySettings(local, user.businessId) };
      });

      scope.post('/loyalty/settings', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          settings: setLoyaltySettings(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          ),
        };
      });

      scope.get<{ Params: { id: string } }>('/customers/:id/loyalty', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listLoyaltyEntries(local, user.businessId, request.params.id)),
        };
      });

      scope.post('/loyalty/adjust', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await adjustLoyalty(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          )),
        };
      });

      scope.get<{ Params: { id: string } }>('/customers/:id/notes', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          items: await listCustomerNotes(local, user.businessId, request.params.id),
        };
      });

      scope.post<{ Params: { id: string } }>('/customers/:id/notes', async (request) => {
        const { user, db: local } = userIdOf(request);
        const note = await addCustomerNote(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.params.id,
          request.body ?? {}
        );
        return { ok: true, note };
      });

      scope.get<{ Params: { id: string } }>('/customers/:id/summary', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          summary: await customerVisitSummary(local, user.businessId, request.params.id),
        };
      });

      scope.get<{ Querystring: { receipt?: string } }>('/returns/lookup', async (request) => {
        const { user, db: local } = userIdOf(request);
        const receipt = typeof request.query.receipt === 'string' ? request.query.receipt : '';
        if (!receipt.trim()) {
          const err = new Error('Scan or type a receipt number');
          (err as NodeJS.ErrnoException).code = 'SALE_NOT_FOUND';
          throw err;
        }
        return {
          ok: true,
          sale: await lookupSaleByReceipt(local, user.businessId, user.permissions, receipt),
        };
      });

      scope.post('/returns', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createSaleReturn(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'sale.updated', { reason: 'return', id: result.id });
        return { ok: true, ...result };
      });

      scope.get('/returns', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'sales.view');
        return {
          ok: true,
          ...(await listSaleReturns(local, user.businessId, queryOf(request.query))),
        };
      });

      scope.get('/transfers', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await listStockTransfers(local, user.businessId, queryOf(request.query))),
        };
      });

      scope.post('/transfers', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await createStockTransfer(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'inventory.changed', { reason: 'transfer' });
        return { ok: true, ...result };
      });

      scope.get('/debtors', async (request) => {
        const { user, db: local } = userIdOf(request);
        return { ok: true, ...(await listDebtors(local, user.businessId, queryOf(request.query))) };
      });

      scope.post('/debtors/remind', async (request) => {
        const { user, db: local } = userIdOf(request);
        const result = await sendDebtorReminders(
          local,
          user.businessId,
          user.id,
          user.permissions,
          request.body ?? {}
        );
        scope.realtime.emit(user.businessId, 'automation.changed', { reason: 'debtors' });
        return { ok: true, result };
      });

      scope.get('/cloud-backup', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        return {
          ok: true,
          settings: cloudBackupView(getCloudBackupSettings(local, user.businessId)),
        };
      });

      scope.post('/cloud-backup', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          settings: setCloudBackupSettings(
            local,
            user.businessId,
            user.id,
            user.permissions,
            request.body ?? {}
          ),
        };
      });

      scope.post('/cloud-backup/run', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...(await runEncryptedCloudBackup(
            local,
            user.businessId,
            user.id,
            user.permissions,
            scope.backupsDir
          )),
        };
      });

      scope.get('/cloud-backup/uploads', async (request) => {
        const { user, db: local } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        return { ok: true, items: listCloudUploads(local, user.businessId) };
      });

      // --- Batch 12: backups. Snapshots live beside the database file on the
      // primary computer; every operation requires settings.manage.
      scope.get('/backups', async (request) => {
        const { user } = userIdOf(request);
        requirePermission(new Set(user.permissions), 'settings.manage');
        return { ok: true, dir: scope.backupsDir, items: listBackups(scope.backupsDir) };
      });

      scope.post('/backups', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...createBackup(local, scope.backupsDir, user.permissions, user.id, user.businessId),
        };
      });

      scope.post('/backups/restore', async (request) => {
        const { user, db: local } = userIdOf(request);
        const { name } = (request.body ?? {}) as { name?: unknown };
        return {
          ok: true,
          ...restoreBackup(
            local,
            dbPathOf(options),
            scope.backupsDir,
            user.permissions,
            user.id,
            user.businessId,
            name
          ),
        };
      });

      scope.delete<{ Params: { name: string } }>('/backups/:name', async (request) => {
        const { user, db: local } = userIdOf(request);
        return {
          ok: true,
          ...deleteBackup(
            local,
            scope.backupsDir,
            user.permissions,
            user.id,
            user.businessId,
            request.params.name
          ),
        };
      });
    },
    { prefix: '/api' }
  );

  // --- Batch 8: sync relay. Branches authenticate with a shared key instead of
  // a login because they push and pull unattended on a timer. The relay stores
  // the newest snapshot of every row and serves it in seq order.
  void app.register(
    async (scope) => {
      scope.addHook('preHandler', async (request) => {
        if (!scope.syncKey) {
          const err = new Error('This server is not accepting sync connections');
          (err as NodeJS.ErrnoException).code = 'SYNC_NOT_CONFIGURED';
          throw err;
        }
        const header = request.headers['x-sync-key'];
        const provided = typeof header === 'string' ? header : '';
        if (!provided || !secretEquals(provided, scope.syncKey)) {
          const err = new Error('Invalid sync key');
          (err as NodeJS.ErrnoException).code = 'SYNC_UNAUTHORIZED';
          throw err;
        }
        const status = getLicenseStatus(scope.db, { publicKey: scope.licensePublicKey });
        if (!status.usable) {
          const err = new Error(status.reason ?? 'This copy needs a license key');
          (err as NodeJS.ErrnoException).code = 'LICENSE_REQUIRED';
          throw err;
        }
      });

      scope.post('/push', async (request) => {
        const businessId = hubBusinessId(scope.db);
        const body = (request.body ?? {}) as { records?: unknown };
        if (!Array.isArray(body.records)) throw syncInvalid('Push expects a records array');
        if (body.records.length > SYNC_MAX_BATCH) {
          throw syncInvalid(`Push accepts at most ${SYNC_MAX_BATCH} records at a time`);
        }
        const result = ingestRecords(scope.db, businessId, body.records);
        scope.realtime.emit(businessId, 'sync.changed', { reason: 'push', ...result });
        return { ok: true, ...result };
      });

      scope.get('/pull', async (request) => {
        const businessId = hubBusinessId(scope.db);
        const query = queryOf(request.query);
        if (!isSyncEntity(query.entity)) throw syncInvalid('Unknown sync entity');
        const since = query.since === undefined ? 0 : Number(query.since);
        const limit = query.limit === undefined ? SYNC_MAX_BATCH : Number(query.limit);
        if (!Number.isInteger(since) || since < 0)
          throw syncInvalid('since must be a whole number');
        if (!Number.isInteger(limit) || limit < 1)
          throw syncInvalid('limit must be a whole number');
        const page = listRecordsSince(
          scope.db,
          businessId,
          query.entity,
          since,
          Math.min(limit, SYNC_MAX_BATCH)
        );
        return { ok: true, ...page };
      });
    },
    { prefix: '/sync' }
  );

  return app;
}

export async function startServer(
  app: FastifyInstance,
  options: StartOptions = {}
): Promise<string> {
  const io = new SocketIOServer(app.server, {
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const raw = socket.handshake.auth?.token;
    const token = typeof raw === 'string' ? raw : '';
    authenticate(app.db, token)
      .then((user) => {
        if (!user) {
          next(new Error('Unauthorized'));
          return;
        }
        socket.data.businessId = user.businessId;
        void socket.join(businessRoom(user.businessId));
        next();
      })
      .catch(next);
  });

  app.realtime.attach(io);

  // Batch 12: one verified snapshot per day, taken by the primary computer.
  // The timer is unref'd so it never keeps a short-lived process alive.
  const runBackup = async (): Promise<void> => {
    try {
      if (await isFirstRun(app.db)) return;
      const result = runDailyBackupIfDue(app.db, app.backupsDir, 14);
      if (result) app.log.info(`Daily backup written: ${result.backup.name}`);
    } catch (err: unknown) {
      app.log.warn(`Automatic backup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const firstRun = setTimeout(() => void runBackup(), 60_000);
  firstRun.unref();
  const timer = setInterval(() => void runBackup(), 60 * 60 * 1000);
  timer.unref();

  // Batch 11: low-stock and daily-summary triggers. The once-a-day guards live
  // in automation_settings, so a frequent tick is safe and cheap.
  const runAutomations = async (): Promise<void> => {
    try {
      if (await isFirstRun(app.db)) return;
      const business = app.db.raw
        .prepare('SELECT id FROM businesses ORDER BY rowid LIMIT 1')
        .get() as { id: string } | undefined;
      if (!business) return;
      const result = await runAutomation(app.db, business.id);
      if (result.queued > 0) {
        app.log.info(`Automation sent ${result.queued} message(s)`);
        app.realtime.emit(business.id, 'automation.changed', { reason: 'scheduled' });
      }
    } catch (err: unknown) {
      app.log.warn(`Automation tick failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const firstAutomation = setTimeout(() => void runAutomations(), 90_000);
  firstAutomation.unref();
  const automationTimer = setInterval(() => void runAutomations(), 15 * 60 * 1000);
  automationTimer.unref();
  app.addHook('onClose', async () => {
    clearTimeout(firstRun);
    clearInterval(timer);
    clearTimeout(firstAutomation);
    clearInterval(automationTimer);
  });

  return app.listen({
    port: options.port ?? Number(process.env.PORT ?? 3001),
    host: options.host ?? process.env.HOST ?? '0.0.0.0',
  });
}
