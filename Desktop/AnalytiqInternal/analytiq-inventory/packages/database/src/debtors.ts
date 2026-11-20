// Batch 15: debtor reminders over WhatsApp.
//
// The credit ledger already knows who owes what. This service lists debtors
// and sends a short, polite reminder through the same WhatsApp Cloud API used
// by low-stock alerts. Every attempt is recorded in `debtor_reminders` and in
// the automation outbox, so it works as a preview when WhatsApp is off.

import { debtorReminderSchema } from '@analytiq/validation';
import { eq } from 'drizzle-orm';
import { newId } from './auth';
import { queueAndDeliverWhatsApp } from './automation';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { businesses } from './schema';
import { writeAuditSync } from './service';

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

function escLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface DebtorView {
  customerId: string;
  name: string;
  phone: string;
  balanceKobo: number;
  lastReminderAt: string | null;
}

export async function listDebtors(
  local: LocalDb,
  businessId: string,
  raw: unknown = {}
): Promise<{ items: DebtorView[]; totalKobo: number }> {
  const search = String((raw as { search?: unknown })?.search ?? '').trim();
  const params: Array<string | number> = [businessId, businessId, businessId, businessId];
  let searchSql = '';
  if (search) {
    const pattern = `%${escLike(search)}%`;
    searchSql = ` AND (c.name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')`;
    params.push(pattern, pattern);
  }
  const rows = local.raw
    .prepare(
      `SELECT c.id AS customerId, c.name AS name, c.phone AS phone,
              COALESCE((SELECT SUM(sp.amount_kobo)
                          FROM sale_payments sp
                          JOIN sales s ON s.id = sp.sale_id
                         WHERE s.business_id = ? AND s.customer_id = c.id
                           AND s.status = 'completed' AND sp.method = 'credit'), 0)
              - COALESCE((SELECT SUM(cp.amount_kobo) FROM customer_payments cp
                           WHERE cp.business_id = ? AND cp.customer_id = c.id), 0) AS balanceKobo,
              (SELECT MAX(dr.sent_at) FROM debtor_reminders dr
                WHERE dr.business_id = ? AND dr.customer_id = c.id) AS lastReminderAt
         FROM customers c
        WHERE c.business_id = ? AND c.is_active = 1${searchSql}
        ORDER BY balanceKobo DESC, c.name ASC`
    )
    .all(...params) as Array<{
    customerId: string;
    name: string;
    phone: string;
    balanceKobo: number;
    lastReminderAt: number | null;
  }>;
  const debtors = rows
    .filter((r) => r.balanceKobo > 1)
    .map((r) => ({
      customerId: r.customerId,
      name: r.name,
      phone: r.phone,
      balanceKobo: r.balanceKobo,
      lastReminderAt: r.lastReminderAt ? new Date(r.lastReminderAt * 1000).toISOString() : null,
    }));
  return { items: debtors, totalKobo: debtors.reduce((sum, d) => sum + d.balanceKobo, 0) };
}

export interface DebtorReminderResult {
  attempted: number;
  sent: number;
  dryRun: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function sendDebtorReminders(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<DebtorReminderResult> {
  requirePermission(new Set(grants), 'customers.manage');
  const input = debtorReminderSchema.parse(raw ?? {});

  const [business] = await local.db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .all();
  if (!business) throw codedError('Business not found', 'BUSINESS_NOT_FOUND');

  const { items } = await listDebtors(local, businessId);
  const wanted = input.customerIds ? new Set(input.customerIds) : null;
  const targets = items.filter((d) => (wanted ? wanted.has(d.customerId) : true));

  const result: DebtorReminderResult = {
    attempted: targets.length,
    sent: 0,
    dryRun: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const debtor of targets) {
    const id = newId('dr');
    const createdAt = new Date();
    if (!debtor.phone.trim()) {
      result.skipped += 1;
      result.errors.push(`${debtor.name}: no phone number`);
      local.raw
        .prepare(
          `INSERT INTO debtor_reminders (id, business_id, customer_id, balance_kobo, status, error, created_at)
           VALUES (?, ?, ?, ?, 'skipped', ?, ?)`
        )
        .run(id, businessId, debtor.customerId, debtor.balanceKobo, 'No phone number', Math.floor(createdAt.getTime() / 1000));
      continue;
    }

    const body =
      `Hello ${debtor.name}, this is a friendly reminder from ${business.name}. ` +
      `Your outstanding balance is ${naira(debtor.balanceKobo)}. ` +
      `Kindly settle when convenient. Thank you.`;

    if (input.dryRun) {
      result.dryRun += 1;
      local.raw
        .prepare(
          `INSERT INTO debtor_reminders (id, business_id, customer_id, balance_kobo, status, error, created_at)
           VALUES (?, ?, ?, ?, 'dry_run', '', ?)`
        )
        .run(id, businessId, debtor.customerId, debtor.balanceKobo, Math.floor(createdAt.getTime() / 1000));
      continue;
    }

    const message = await queueAndDeliverWhatsApp(
      local,
      businessId,
      { kind: 'debtor_reminder', to: debtor.phone, body },
      options
    );
    const status = message.status === 'sent' ? 'sent' : message.status === 'failed' ? 'failed' : 'dry_run';
    if (status === 'sent') result.sent += 1;
    else if (status === 'failed') {
      result.failed += 1;
      result.errors.push(`${debtor.name}: ${message.error}`);
    } else result.dryRun += 1;

    local.raw
      .prepare(
        `INSERT INTO debtor_reminders (id, business_id, customer_id, balance_kobo, status, error, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        businessId,
        debtor.customerId,
        debtor.balanceKobo,
        status,
        message.error.slice(0, 300),
        Math.floor(createdAt.getTime() / 1000),
        status === 'sent' ? Math.floor(Date.now() / 1000) : null
      );
  }

  writeAuditSync(local, {
    businessId,
    userId,
    action: 'debtors.remind',
    entity: 'business',
    entityId: businessId,
    details: { ...result },
  });
  return result;
}
