import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Server as SocketIOServer } from 'socket.io';
import { join } from 'node:path';
import {
  adjustStock,
  archiveCustomer,
  archiveProduct,
  archiveSupplier,
  authenticate,
  cancelPurchase,
  closeLocalDb,
  countStock,
  createCategory,
  createCustomer,
  createProduct,
  createPurchase,
  createSale,
  createSupplier,
  createTable,
  createTaxCategory,
  deleteTable,
  ensureDefaultTaxCategory,
  getCustomer,
  getLevels,
  getProduct,
  getSale,
  isFirstRun,
  listCategories,
  listCustomerPayments,
  listCustomers,
  listMovements,
  listProducts,
  listPurchases,
  listSales,
  listSuppliers,
  listTables,
  listTaxCategories,
  login,
  logout,
  openLocalDb,
  recordCustomerPayment,
  receivePurchase,
  refundSale,
  restoreProduct,
  runMigrations,
  runSetup,
  setTableStatus,
  updateCustomer,
  updateProduct,
  updateSupplier,
  updateTable,
  updateTaxCategory,
  voidSale,
  type AuthenticatedUser,
  type LocalDb,
} from '@analytiq/database';

declare module 'fastify' {
  interface FastifyInstance {
    db: LocalDb;
    realtime: RealtimeHub;
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
}

interface StartOptions {
  port?: number;
  host?: string;
}

export function businessRoom(businessId: string): string {
  return `business:${businessId}`;
}

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
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'ACCOUNT_LOCKED') return 423;
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (code.endsWith('_EXISTS') || code === 'ALREADY_SETUP' || code === 'TAX_CATEGORY_EXISTS') {
    return 409;
  }
  return 400;
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
  app.decorateRequest('user', null);
  app.decorateRequest('token', '');
  app.addHook('onClose', async () => {
    closeLocalDb(db);
  });

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
      });

      scope.post('/auth/logout', async (request) => {
        if (request.token) await logout(scope.db, request.token);
        return { ok: true };
      });

      scope.get('/auth/me', async (request) => {
        const { user } = userIdOf(request);
        return { ok: true, user };
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

      scope.get('/products', async (request) => {
        const { user, db: local } = userIdOf(request);
        const raw = queryOf(request.query);
        const query = { ...raw, includeInactive: boolQuery(raw.includeInactive) };
        return { ok: true, ...(await listProducts(local, user.businessId, query)) };
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
    },
    { prefix: '/api' }
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
  return app.listen({
    port: options.port ?? Number(process.env.PORT ?? 3001),
    host: options.host ?? process.env.HOST ?? '0.0.0.0',
  });
}
