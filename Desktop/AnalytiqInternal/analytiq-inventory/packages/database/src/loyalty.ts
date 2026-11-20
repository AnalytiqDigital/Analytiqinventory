// Batch 15: loyalty points + simple CRM.
//
// Points are a ledger: earn on a sale, redeem on a sale, or adjust by hand.
// The balance is always SUM(points), never a stored counter. Redemption is
// applied as a discount on the sale total (before payments), so receipts and
// reports reconcile without a second tender type.
//
// Settings live in app_settings under `loyalty.settings` and can be changed
// from Settings → Loyalty. Defaults: 1 point per ₦100 spent, 1 point = ₦1.

import {
  customerNoteSchema,
  loyaltyAdjustSchema,
  loyaltySettingsSchema,
} from '@analytiq/validation';
import { and, eq } from 'drizzle-orm';
import { newId } from './auth';
import { getJsonSetting, setSetting } from './appSettings';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { writeAuditSync } from './service';
import { customerNotes, customers, loyaltyEntries, users } from './schema';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export interface LoyaltySettings {
  enabled: boolean;
  earnKoboPerPoint: number;
  pointValueKobo: number;
}

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: true,
  earnKoboPerPoint: 10_000,
  pointValueKobo: 100,
};

export function getLoyaltySettings(local: LocalDb, businessId: string): LoyaltySettings {
  return (
    getJsonSetting<LoyaltySettings>(local, businessId, 'loyalty.settings') ?? {
      ...DEFAULT_LOYALTY_SETTINGS,
    }
  );
}

export function setLoyaltySettings(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): LoyaltySettings {
  requirePermission(new Set(grants), 'settings.manage');
  const input = loyaltySettingsSchema.parse(raw);
  const settings: LoyaltySettings = {
    enabled: input.enabled,
    earnKoboPerPoint: input.earnKoboPerPoint,
    pointValueKobo: input.pointValueKobo,
  };
  setSetting(local, businessId, 'loyalty.settings', JSON.stringify(settings));
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'loyalty.settings',
    entity: 'business',
    entityId: businessId,
    details: settings,
  });
  return settings;
}

export function loyaltyBalance(local: LocalDb, businessId: string, customerId: string): number {
  const row = local.raw
    .prepare(
      'SELECT COALESCE(SUM(points), 0) AS v FROM loyalty_entries WHERE business_id = ? AND customer_id = ?'
    )
    .get(businessId, customerId) as { v: number };
  return Math.max(0, row.v);
}

export function pointsEarned(totalKobo: number, earnKoboPerPoint: number): number {
  if (totalKobo <= 0 || earnKoboPerPoint <= 0) return 0;
  return Math.floor(totalKobo / earnKoboPerPoint);
}

/**
 * Cap a redemption request by the customer's balance and by the sale total.
 * Returns the points actually used and the discount they buy.
 */
export function computeRedemption(input: {
  requestedPoints: number;
  balance: number;
  totalKobo: number;
  pointValueKobo: number;
}): { points: number; discountKobo: number } {
  const value = Math.max(1, Math.floor(input.pointValueKobo));
  const maxByTotal = Math.floor(Math.max(0, input.totalKobo) / value);
  const points = Math.max(
    0,
    Math.min(Math.floor(input.requestedPoints), Math.floor(input.balance), maxByTotal)
  );
  return { points, discountKobo: points * value };
}

export interface LoyaltyEntryView {
  id: string;
  kind: string;
  points: number;
  reason: string;
  saleId: string | null;
  createdAt: string;
  userName: string | null;
}

export async function listLoyaltyEntries(
  local: LocalDb,
  businessId: string,
  customerId: string,
  limit = 100
): Promise<{ items: LoyaltyEntryView[]; balance: number }> {
  const rows = local.raw
    .prepare(
      `SELECT e.id AS id, e.kind AS kind, e.points AS points, e.reason AS reason,
              e.sale_id AS saleId, e.created_at AS createdAtMs, u.name AS userName
         FROM loyalty_entries e
         LEFT JOIN users u ON u.id = e.created_by
        WHERE e.business_id = ? AND e.customer_id = ?
        ORDER BY e.created_at DESC, e.rowid DESC
        LIMIT ?`
    )
    .all(businessId, customerId, Math.min(Math.max(limit, 1), 200)) as Array<{
    id: string;
    kind: string;
    points: number;
    reason: string;
    saleId: string | null;
    createdAtMs: number;
    userName: string | null;
  }>;
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      points: r.points,
      reason: r.reason,
      saleId: r.saleId,
      createdAt: new Date(r.createdAtMs * 1000).toISOString(),
      userName: r.userName,
    })),
    balance: loyaltyBalance(local, businessId, customerId),
  };
}

export function recordLoyalty(
  local: LocalDb,
  entry: {
    businessId: string;
    customerId: string;
    kind: 'earn' | 'redeem' | 'adjust';
    points: number;
    saleId?: string | null;
    reason?: string;
    userId?: string | null;
    createdAt?: Date;
  }
): void {
  if (entry.points === 0) return;
  local.db
    .insert(loyaltyEntries)
    .values({
      id: newId('loy'),
      businessId: entry.businessId,
      customerId: entry.customerId,
      saleId: entry.saleId ?? null,
      kind: entry.kind,
      points: entry.points,
      reason: entry.reason ?? '',
      createdBy: entry.userId ?? null,
      createdAt: entry.createdAt ?? new Date(),
    })
    .run();
}

/** Manual correction from the customer profile (positive or negative). */
export async function adjustLoyalty(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): Promise<{ balance: number }> {
  requirePermission(new Set(grants), 'customers.manage');
  const input = loyaltyAdjustSchema.parse(raw);
  const [customer] = await local.db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, input.customerId)))
    .limit(1)
    .all();
  if (!customer) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');
  const balance = loyaltyBalance(local, businessId, input.customerId);
  if (balance + input.points < 0) {
    throw codedError(`Only ${balance} point${balance === 1 ? '' : 's'} available`, 'LOYALTY_INSUFFICIENT');
  }
  recordLoyalty(local, {
    businessId,
    customerId: input.customerId,
    kind: 'adjust',
    points: input.points,
    reason: input.reason,
    userId,
  });
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'loyalty.adjust',
    entity: 'customer',
    entityId: input.customerId,
    details: { points: input.points, reason: input.reason },
  });
  return { balance: loyaltyBalance(local, businessId, input.customerId) };
}

export interface CustomerNoteView {
  id: string;
  body: string;
  createdAt: string;
  userName: string | null;
}

export async function listCustomerNotes(
  local: LocalDb,
  businessId: string,
  customerId: string
): Promise<CustomerNoteView[]> {
  const rows = local.raw
    .prepare(
      `SELECT n.id AS id, n.body AS body, n.created_at AS createdAtMs, u.name AS userName
         FROM customer_notes n
         LEFT JOIN users u ON u.id = n.created_by
        WHERE n.business_id = ? AND n.customer_id = ?
        ORDER BY n.created_at DESC, n.rowid DESC
        LIMIT 200`
    )
    .all(businessId, customerId) as Array<{
    id: string;
    body: string;
    createdAtMs: number;
    userName: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: new Date(r.createdAtMs * 1000).toISOString(),
    userName: r.userName,
  }));
}

export async function addCustomerNote(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  customerId: string,
  raw: unknown
): Promise<CustomerNoteView> {
  requirePermission(new Set(grants), 'customers.manage');
  const input = customerNoteSchema.parse(raw);
  const [customer] = await local.db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.businessId, businessId), eq(customers.id, customerId)))
    .limit(1)
    .all();
  if (!customer) throw codedError('Customer not found', 'CUSTOMER_NOT_FOUND');

  const id = newId('cno');
  const timestamp = new Date();
  local.db
    .insert(customerNotes)
    .values({
      id,
      businessId,
      customerId,
      body: input.body,
      createdBy: userId,
      createdAt: timestamp,
    })
    .run();
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'customer.note',
    entity: 'customer',
    entityId: customerId,
    details: { noteId: id },
  });
  const [user] = await local.db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .all();
  return {
    id,
    body: input.body,
    createdAt: timestamp.toISOString(),
    userName: user?.name ?? null,
  };
}

/** Lifetime visit summary shown on the customer profile. */
export async function customerVisitSummary(
  local: LocalDb,
  businessId: string,
  customerId: string
): Promise<{ visits: number; spentKobo: number; lastVisitAt: string | null }> {
  const row = local.raw
    .prepare(
      `SELECT COUNT(*) AS visits, COALESCE(SUM(total_kobo), 0) AS spent, MAX(created_at) AS lastMs
         FROM sales
        WHERE business_id = ? AND customer_id = ? AND status = 'completed'`
    )
    .get(businessId, customerId) as { visits: number; spent: number; lastMs: number | null };
  return {
    visits: row.visits,
    spentKobo: row.spent,
    lastVisitAt: row.lastMs ? new Date(row.lastMs * 1000).toISOString() : null,
  };
}
