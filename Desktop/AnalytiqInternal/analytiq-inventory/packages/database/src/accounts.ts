// Batch 17: cash & bank accounts. One ledger per account, fed automatically by
// sales, refunds, expenses and customer payments, plus manual transfers and
// adjustments. Amounts are signed kobo: positive money in, negative money out.

import {
  accountAdjustSchema,
  accountPaymentMapSchema,
  accountSchema,
  accountTransactionsQuerySchema,
  accountTransferSchema,
  accountUpdateSchema,
  type AccountKind,
  type PaymentMethod,
} from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { getJsonSetting, setSetting } from './appSettings';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { accounts, accountTransactions } from './schema';

const PAYMENT_MAP_KEY = 'accounts.payment-map';

export interface AccountView {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalanceKobo: number;
  balanceKobo: number;
  isDefault: boolean;
  archived: boolean;
  createdAt: string;
}

export interface AccountTransactionView {
  id: string;
  accountId: string;
  accountName: string;
  kind: string;
  amountKobo: number;
  reference: string;
  note: string;
  source: string;
  sourceId: string | null;
  createdAt: string;
}

export interface AccountLedger {
  items: AccountTransactionView[];
  moneyInKobo: number;
  moneyOutKobo: number;
}

export type AccountPaymentMap = Partial<Record<'cash' | 'transfer' | 'pos', string>>;

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function amountOf(local: LocalDb, accountId: string): number {
  const row = local.raw
    .prepare(
      `SELECT a.opening_balance_kobo + COALESCE(SUM(t.amount_kobo), 0) AS balance
         FROM accounts a
         LEFT JOIN account_transactions t ON t.account_id = a.id
        WHERE a.id = ?`
    )
    .get(accountId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

function activeAccount(local: LocalDb, businessId: string, accountId: string) {
  const [row] = local.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.businessId, businessId)))
    .limit(1)
    .all();
  if (!row) throw codedError('Account not found', 'ACCOUNT_NOT_FOUND');
  if (row.archived === 1) throw codedError(`${row.name} is archived`, 'ACCOUNT_ARCHIVED');
  return row;
}

function post(
  local: LocalDb,
  input: {
    businessId: string;
    accountId: string;
    kind: string;
    amountKobo: number;
    reference?: string;
    note?: string;
    source: string;
    sourceId?: string | null;
    userId?: string | null;
    createdAt?: Date;
  }
): void {
  if (input.amountKobo === 0) return;
  local.db
    .insert(accountTransactions)
    .values({
      id: newId('actx'),
      businessId: input.businessId,
      accountId: input.accountId,
      kind: input.kind,
      amountKobo: input.amountKobo,
      reference: input.reference ?? '',
      note: input.note ?? '',
      source: input.source,
      sourceId: input.sourceId ?? null,
      userId: input.userId ?? null,
      createdAt: input.createdAt ?? new Date(),
    })
    .run();
}

/** Cash account is the fallback destination for every cash movement. */
export function ensureCashAccountSync(local: LocalDb, businessId: string): string {
  const row = local.raw
    .prepare(
      `SELECT id FROM accounts WHERE business_id = ? AND kind = 'cash' AND archived = 0
        ORDER BY is_default DESC, created_at ASC LIMIT 1`
    )
    .get(businessId) as { id: string } | undefined;
  if (row) return row.id;

  const id = newId('acc');
  const now = new Date();
  local.db
    .insert(accounts)
    .values({
      id,
      businessId,
      name: 'Cash',
      kind: 'cash',
      openingBalanceKobo: 0,
      isDefault: 1,
      archived: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export function getPaymentMap(local: LocalDb, businessId: string): AccountPaymentMap {
  return getJsonSetting<AccountPaymentMap>(local, businessId, PAYMENT_MAP_KEY) ?? {};
}

function findActiveAccount(
  local: LocalDb,
  businessId: string,
  predicate: string,
  ...params: unknown[]
): string | null {
  const row = local.raw
    .prepare(
      `SELECT id FROM accounts WHERE business_id = ? AND archived = 0 AND ${predicate}
        ORDER BY is_default DESC, created_at ASC LIMIT 1`
    )
    .get(businessId, ...params) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Where a tender lands: explicit per-method mapping first, then the natural
 * account kind (cash drawer / bank / POS terminal), then the cash drawer.
 */
export function resolvePaymentAccountSync(
  local: LocalDb,
  businessId: string,
  method: PaymentMethod | string
): string {
  const map = getPaymentMap(local, businessId);
  const mapped = map[method as keyof AccountPaymentMap];
  if (mapped) {
    const hit = findActiveAccount(local, businessId, 'id = ?', mapped);
    if (hit) return hit;
  }
  const kind: AccountKind | null =
    method === 'cash'
      ? 'cash'
      : method === 'transfer'
        ? 'bank'
        : method === 'pos'
          ? 'pos'
          : method === 'mobile'
            ? 'mobile'
            : null;
  if (kind) {
    const hit = findActiveAccount(local, businessId, 'kind = ?', kind);
    if (hit) return hit;
  }
  if (method !== 'cash') {
    const any = findActiveAccount(local, businessId, '1 = 1');
    if (any) return any;
  }
  return ensureCashAccountSync(local, businessId);
}

/** Posts the money actually kept from a sale (change is handed back in cash). */
export function postSalePaymentsSync(
  local: LocalDb,
  businessId: string,
  input: {
    saleId: string;
    receiptNo: string;
    payments: Array<{ method: PaymentMethod; amountKobo: number }>;
    changeKobo: number;
    userId: string;
    createdAt: Date;
  }
): void {
  let changeLeft = Math.max(0, input.changeKobo);
  const kept: Array<{ method: PaymentMethod; amountKobo: number }> = [];
  for (const payment of input.payments) {
    if (payment.method === 'credit') continue;
    let amount = payment.amountKobo;
    if (payment.method === 'cash' && changeLeft > 0) {
      const give = Math.min(changeLeft, amount);
      amount -= give;
      changeLeft -= give;
    }
    if (amount > 0) kept.push({ method: payment.method, amountKobo: amount });
  }
  for (const payment of kept) {
    post(local, {
      businessId,
      accountId: resolvePaymentAccountSync(local, businessId, payment.method),
      kind: 'sale',
      amountKobo: payment.amountKobo,
      reference: input.receiptNo,
      note: `Sale ${input.receiptNo}`,
      source: 'sale',
      sourceId: input.saleId,
      userId: input.userId,
      createdAt: input.createdAt,
    });
  }
}

export function postRefundSync(
  local: LocalDb,
  businessId: string,
  input: {
    saleId: string;
    returnId: string;
    receiptNo: string;
    refundKobo: number;
    method: string;
    userId: string;
    createdAt: Date;
  }
): void {
  if (input.refundKobo <= 0) return;
  post(local, {
    businessId,
    accountId: resolvePaymentAccountSync(local, businessId, input.method),
    kind: 'refund',
    amountKobo: -input.refundKobo,
    reference: input.receiptNo,
    note: `Refund on ${input.receiptNo}`,
    source: 'refund',
    sourceId: input.returnId,
    userId: input.userId,
    createdAt: input.createdAt,
  });
}

/** Void: take every sale posting back out of the account it landed in. */
export function reverseSalePostingsSync(
  local: LocalDb,
  businessId: string,
  saleId: string,
  receiptNo: string,
  userId: string,
  createdAt: Date
): void {
  const already = local.raw
    .prepare(
      `SELECT COUNT(*) AS n FROM account_transactions WHERE business_id = ? AND source = 'sale_void' AND source_id = ?`
    )
    .get(businessId, saleId) as { n: number };
  if (already.n > 0) return;
  const rows = local.raw
    .prepare(
      `SELECT account_id AS accountId, SUM(amount_kobo) AS amountKobo
         FROM account_transactions
        WHERE business_id = ? AND source = 'sale' AND source_id = ?
        GROUP BY account_id`
    )
    .all(businessId, saleId) as Array<{ accountId: string; amountKobo: number }>;
  for (const row of rows) {
    post(local, {
      businessId,
      accountId: row.accountId,
      kind: 'sale_void',
      amountKobo: -row.amountKobo,
      reference: receiptNo,
      note: `Void ${receiptNo}`,
      source: 'sale_void',
      sourceId: saleId,
      userId,
      createdAt,
    });
  }
}

/** Expense out of a chosen account, or the cash drawer by default. */
export function postExpenseSync(
  local: LocalDb,
  businessId: string,
  input: {
    expenseId: string;
    amountKobo: number;
    accountId?: string | null;
    category: string;
    userId: string;
    createdAt: Date;
  }
): string {
  const accountId = input.accountId
    ? activeAccount(local, businessId, input.accountId).id
    : ensureCashAccountSync(local, businessId);
  post(local, {
    businessId,
    accountId,
    kind: 'expense',
    amountKobo: -input.amountKobo,
    note: input.category,
    source: 'expense',
    sourceId: input.expenseId,
    userId: input.userId,
    createdAt: input.createdAt,
  });
  return accountId;
}

/** Undo the net effect an expense currently has, on every account it touched. */
export function reverseExpensePostingsSync(
  local: LocalDb,
  businessId: string,
  expenseId: string,
  note: string,
  userId: string
): void {
  const rows = local.raw
    .prepare(
      `SELECT account_id AS accountId, SUM(amount_kobo) AS amountKobo
         FROM account_transactions
        WHERE business_id = ? AND source = 'expense' AND source_id = ?
        GROUP BY account_id`
    )
    .all(businessId, expenseId) as Array<{ accountId: string; amountKobo: number }>;
  for (const row of rows) {
    post(local, {
      businessId,
      accountId: row.accountId,
      kind: 'expense_reversal',
      amountKobo: -row.amountKobo,
      note,
      source: 'expense',
      sourceId: expenseId,
      userId,
      createdAt: new Date(),
    });
  }
}

export function postCustomerPaymentSync(
  local: LocalDb,
  businessId: string,
  input: {
    paymentId: string;
    amountKobo: number;
    method: string;
    reference?: string;
    accountId?: string | null;
    customerName?: string;
    userId: string;
  }
): string {
  const accountId = input.accountId
    ? activeAccount(local, businessId, input.accountId).id
    : resolvePaymentAccountSync(local, businessId, input.method);
  post(local, {
    businessId,
    accountId,
    kind: 'customer_payment',
    amountKobo: input.amountKobo,
    reference: input.reference ?? '',
    note: input.customerName ? `Payment from ${input.customerName}` : 'Customer payment',
    source: 'customer_payment',
    sourceId: input.paymentId,
    userId: input.userId,
  });
  return accountId;
}

// --- Public API -------------------------------------------------------------

export async function listAccounts(
  local: LocalDb,
  businessId: string,
  grants: string[],
  options: { includeArchived?: boolean } = {}
): Promise<{ items: AccountView[]; totalKobo: number }> {
  requirePermission(new Set(grants), 'finance.manage');
  const rows = local.raw
    .prepare(
      `SELECT a.id AS id, a.name AS name, a.kind AS kind,
              a.opening_balance_kobo AS openingBalanceKobo,
              a.is_default AS isDefault, a.archived AS archived, a.created_at AS createdAtMs,
              a.opening_balance_kobo + COALESCE(
                (SELECT SUM(t.amount_kobo) FROM account_transactions t WHERE t.account_id = a.id), 0
              ) AS balanceKobo
         FROM accounts a
        WHERE a.business_id = ? AND (? = 1 OR a.archived = 0)
        ORDER BY a.archived ASC, a.is_default DESC, a.created_at ASC`
    )
    .all(businessId, options.includeArchived ? 1 : 0) as Array<{
    id: string;
    name: string;
    kind: string;
    openingBalanceKobo: number;
    isDefault: number;
    archived: number;
    createdAtMs: number;
    balanceKobo: number;
  }>;
  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as AccountKind,
    openingBalanceKobo: row.openingBalanceKobo,
    balanceKobo: row.balanceKobo,
    isDefault: row.isDefault === 1,
    archived: row.archived === 1,
    createdAt: new Date(row.createdAtMs * 1000).toISOString(),
  }));
  return {
    items,
    totalKobo: items.filter((a) => !a.archived).reduce((sum, a) => sum + a.balanceKobo, 0),
  };
}

export async function createAccount(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ account: AccountView }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = accountSchema.parse(raw);
  const clash = local.raw
    .prepare('SELECT id FROM accounts WHERE business_id = ? AND name = ?')
    .get(businessId, input.name) as { id: string } | undefined;
  if (clash) throw codedError(`An account named ${input.name} already exists`, 'ACCOUNT_EXISTS');

  const activeCount = local.raw
    .prepare('SELECT COUNT(*) AS n FROM accounts WHERE business_id = ? AND archived = 0')
    .get(businessId) as { n: number };
  const makeDefault = input.isDefault || activeCount.n === 0;
  const id = newId('acc');
  const now = new Date();

  const write = local.raw.transaction(() => {
    if (makeDefault) {
      local.raw
        .prepare('UPDATE accounts SET is_default = 0 WHERE business_id = ?')
        .run(businessId);
    }
    local.db
      .insert(accounts)
      .values({
        id,
        businessId,
        name: input.name,
        kind: input.kind,
        openingBalanceKobo: input.openingBalanceKobo,
        isDefault: makeDefault ? 1 : 0,
        archived: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'account.create',
      entity: 'account',
      entityId: id,
      details: { name: input.name, kind: input.kind, openingBalanceKobo: input.openingBalanceKobo },
    });
  });
  write();
  return { account: (await listAccounts(local, businessId, grants, { includeArchived: true })).items.find((a) => a.id === id)! };
}

export async function updateAccount(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  accountId: string,
  raw: unknown
): Promise<{ account: AccountView }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = accountUpdateSchema.parse(raw);
  const existing = activeAccount(local, businessId, accountId);
  if (input.name && input.name !== existing.name) {
    const clash = local.raw
      .prepare('SELECT id FROM accounts WHERE business_id = ? AND name = ? AND id <> ?')
      .get(businessId, input.name, accountId) as { id: string } | undefined;
    if (clash) throw codedError(`An account named ${input.name} already exists`, 'ACCOUNT_EXISTS');
  }

  const write = local.raw.transaction(() => {
    if (input.archived === true) {
      if (existing.isDefault === 1)
        throw codedError('Choose another default account before archiving this one', 'ACCOUNT_IS_DEFAULT');
      const balance = amountOf(local, accountId);
      if (balance !== 0)
        throw codedError(
          `Move the ${(Math.abs(balance) / 100).toFixed(2)} balance out before archiving`,
          'ACCOUNT_HAS_BALANCE'
        );
      const activeCount = local.raw
        .prepare('SELECT COUNT(*) AS n FROM accounts WHERE business_id = ? AND archived = 0')
        .get(businessId) as { n: number };
      if (activeCount.n <= 1)
        throw codedError('A business needs at least one active account', 'ACCOUNT_LAST');
    }
    if (input.isDefault === true) {
      local.raw
        .prepare('UPDATE accounts SET is_default = 0 WHERE business_id = ?')
        .run(businessId);
    }
    local.db
      .update(accounts)
      .set({
        name: input.name ?? existing.name,
        kind: input.kind ?? existing.kind,
        openingBalanceKobo: input.openingBalanceKobo ?? existing.openingBalanceKobo,
        isDefault:
          input.archived === true ? 0 : input.isDefault === true ? 1 : existing.isDefault,
        archived: input.archived === true ? 1 : 0,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId))
      .run();
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'account.update',
      entity: 'account',
      entityId: accountId,
      details: input,
    });
  });
  write();
  return {
    account: (await listAccounts(local, businessId, grants, { includeArchived: true })).items.find(
      (a) => a.id === accountId
    )!,
  };
}

export async function transferBetweenAccounts(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = accountTransferSchema.parse(raw);
  const from = activeAccount(local, businessId, input.fromAccountId);
  const to = activeAccount(local, businessId, input.toAccountId);
  const balance = amountOf(local, from.id);
  if (balance < input.amountKobo) {
    throw codedError(
      `${from.name} only has ${(balance / 100).toFixed(2)} available`,
      'ACCOUNT_INSUFFICIENT'
    );
  }
  const id = newId('trf');
  const now = new Date();
  const write = local.raw.transaction(() => {
    post(local, {
      businessId,
      accountId: from.id,
      kind: 'transfer_out',
      amountKobo: -input.amountKobo,
      reference: id,
      note: input.note || `Transfer to ${to.name}`,
      source: 'transfer',
      sourceId: id,
      userId,
      createdAt: now,
    });
    post(local, {
      businessId,
      accountId: to.id,
      kind: 'transfer_in',
      amountKobo: input.amountKobo,
      reference: id,
      note: input.note || `Transfer from ${from.name}`,
      source: 'transfer',
      sourceId: id,
      userId,
      createdAt: now,
    });
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'account.transfer',
      entity: 'account',
      entityId: id,
      details: { from: from.name, to: to.name, amountKobo: input.amountKobo },
    });
  });
  write();
  return { id };
}

export async function adjustAccount(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ id: string; balanceKobo: number }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = accountAdjustSchema.parse(raw);
  const account = activeAccount(local, businessId, input.accountId);
  if (input.amountKobo < 0) {
    const balance = amountOf(local, account.id);
    if (balance < Math.abs(input.amountKobo)) {
      throw codedError(
        `${account.name} only has ${(balance / 100).toFixed(2)} available`,
        'ACCOUNT_INSUFFICIENT'
      );
    }
  }
  const id = newId('adj');
  const write = local.raw.transaction(() => {
    post(local, {
      businessId,
      accountId: account.id,
      kind: 'adjustment',
      amountKobo: input.amountKobo,
      note: input.note,
      source: 'manual',
      sourceId: id,
      userId,
    });
    writeAuditSync(local, {
      businessId,
      userId,
      action: 'account.adjust',
      entity: 'account',
      entityId: account.id,
      details: { amountKobo: input.amountKobo, note: input.note },
    });
  });
  write();
  return { id, balanceKobo: amountOf(local, account.id) };
}

export async function listAccountTransactions(
  local: LocalDb,
  businessId: string,
  grants: string[],
  raw: unknown
): Promise<AccountLedger> {
  requirePermission(new Set(grants), 'finance.manage');
  const query = accountTransactionsQuerySchema.parse(raw ?? {});
  const params: Array<string | number> = [businessId];
  let where = 't.business_id = ?';
  if (query.accountId) {
    where += ' AND t.account_id = ?';
    params.push(query.accountId);
  }
  if (query.from) {
    where += ' AND t.created_at >= ?';
    params.push(Math.floor(query.from.getTime() / 1000));
  }
  if (query.to) {
    where += ' AND t.created_at <= ?';
    params.push(Math.floor(query.to.getTime() / 1000));
  }
  const rows = local.raw
    .prepare(
      `SELECT t.id AS id, t.account_id AS accountId, a.name AS accountName, t.kind AS kind,
              t.amount_kobo AS amountKobo, t.reference AS reference, t.note AS note,
              t.source AS source, t.source_id AS sourceId, t.created_at AS createdAtMs
         FROM account_transactions t JOIN accounts a ON a.id = t.account_id
        WHERE ${where}
        ORDER BY t.created_at DESC, t.rowid DESC LIMIT ?`
    )
    .all(...params, query.limit) as Array<{
    id: string;
    accountId: string;
    accountName: string;
    kind: string;
    amountKobo: number;
    reference: string;
    note: string;
    source: string;
    sourceId: string | null;
    createdAtMs: number;
  }>;
  const items = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    kind: row.kind,
    amountKobo: row.amountKobo,
    reference: row.reference,
    note: row.note,
    source: row.source,
    sourceId: row.sourceId,
    createdAt: new Date(row.createdAtMs * 1000).toISOString(),
  }));
  return {
    items,
    moneyInKobo: items.filter((t) => t.amountKobo > 0).reduce((s, t) => s + t.amountKobo, 0),
    moneyOutKobo: items.filter((t) => t.amountKobo < 0).reduce((s, t) => s - t.amountKobo, 0),
  };
}

export async function setPaymentMap(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ map: AccountPaymentMap }> {
  requirePermission(new Set(grants), 'finance.manage');
  const input = accountPaymentMapSchema.parse(raw ?? {});
  const map: AccountPaymentMap = {};
  for (const method of ['cash', 'transfer', 'pos'] as const) {
    const accountId = input[method];
    if (accountId) {
      const account = activeAccount(local, businessId, accountId);
      map[method] = account.id;
    }
  }
  setSetting(local, businessId, PAYMENT_MAP_KEY, JSON.stringify(map));
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'account.payment-map',
    entity: 'business',
    entityId: businessId,
    details: map,
  });
  return { map };
}
