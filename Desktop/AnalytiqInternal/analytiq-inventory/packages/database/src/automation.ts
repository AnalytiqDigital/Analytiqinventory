// Batch 11: AI + WhatsApp automation.
//
// Two independent switches, both off by default:
//   * WhatsApp Cloud API delivery of low-stock alerts and a daily summary.
//   * An OpenAI-compatible chat endpoint that rewrites those messages in plain
//     language. If the AI call fails the deterministic text is sent instead.
//
// Every generated message lands in `automation_messages` first. With WhatsApp
// disabled the message is stored as `dry_run`, so owners can preview exactly
// what would be sent without connecting anything.

import { automationSettingsSchema, automationTestSchema } from '@analytiq/validation';
import { eq } from 'drizzle-orm';
import { newId } from './auth';
import type { LocalDb } from './connection';
import { requirePermission } from './permissions';
import { getReportsSummary } from './reports';
import { automationMessages } from './schema';
import { writeAuditSync } from './service';

const GRAPH_VERSION = 'v20.0';
const REQUEST_TIMEOUT_MS = 15_000;
const OUTBOX_RETENTION = 200;
const LOW_STOCK_PREVIEW = 8;

export interface AutomationSettings {
  whatsappEnabled: boolean;
  whatsappPhoneId: string;
  whatsappToken: string;
  whatsappTo: string;
  whatsappTemplate: string;
  whatsappLang: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  lowStockEnabled: boolean;
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
  lastLowStockOn: string;
  lastSummaryOn: string;
}

export type AutomationMessageStatus = 'queued' | 'sent' | 'failed' | 'dry_run';

export interface AutomationMessage {
  id: string;
  kind: string;
  channel: string;
  toAddress: string;
  body: string;
  status: AutomationMessageStatus;
  error: string;
  createdAt: string;
  sentAt: string | null;
}

export interface AutomationRunResult {
  queued: number;
  sent: number;
  failed: number;
  dryRun: number;
  skipped: string[];
}

export interface AutomationRunOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  /** Ignore the once-a-day guards and the summary hour (manual "Run now"). */
  force?: boolean;
}

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

const EMPTY_SETTINGS: AutomationSettings = {
  whatsappEnabled: false,
  whatsappPhoneId: '',
  whatsappToken: '',
  whatsappTo: '',
  whatsappTemplate: '',
  whatsappLang: 'en',
  aiEnabled: false,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  lowStockEnabled: false,
  dailySummaryEnabled: false,
  dailySummaryHour: 20,
  lastLowStockOn: '',
  lastSummaryOn: '',
};

export function getAutomationSettings(local: LocalDb, businessId: string): AutomationSettings {
  const row = local.raw
    .prepare('SELECT * FROM automation_settings WHERE business_id = ?')
    .get(businessId) as Record<string, unknown> | undefined;
  if (!row) return { ...EMPTY_SETTINGS };
  return {
    whatsappEnabled: Number(row.whatsapp_enabled) === 1,
    whatsappPhoneId: String(row.whatsapp_phone_id ?? ''),
    whatsappToken: String(row.whatsapp_token ?? ''),
    whatsappTo: String(row.whatsapp_to ?? ''),
    whatsappTemplate: String(row.whatsapp_template ?? ''),
    whatsappLang: String(row.whatsapp_lang ?? 'en'),
    aiEnabled: Number(row.ai_enabled) === 1,
    aiBaseUrl: String(row.ai_base_url ?? ''),
    aiApiKey: String(row.ai_api_key ?? ''),
    aiModel: String(row.ai_model ?? 'gpt-4o-mini'),
    lowStockEnabled: Number(row.low_stock_enabled) === 1,
    dailySummaryEnabled: Number(row.daily_summary_enabled) === 1,
    dailySummaryHour: Number(row.daily_summary_hour ?? 20),
    lastLowStockOn: String(row.last_low_stock_on ?? ''),
    lastSummaryOn: String(row.last_summary_on ?? ''),
  };
}

/** Settings safe to hand to the renderer: secrets become "is one saved?". */
export interface AutomationSettingsView extends Omit<
  AutomationSettings,
  'whatsappToken' | 'aiApiKey'
> {
  whatsappTokenSet: boolean;
  aiApiKeySet: boolean;
}

export function toAutomationView(settings: AutomationSettings): AutomationSettingsView {
  const { whatsappToken, aiApiKey, ...rest } = settings;
  return { ...rest, whatsappTokenSet: whatsappToken !== '', aiApiKeySet: aiApiKey !== '' };
}

export function setAutomationSettings(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown
): AutomationSettings {
  requirePermission(new Set(grants), 'settings.manage');
  const input = automationSettingsSchema.parse(raw);
  const existing = getAutomationSettings(local, businessId);
  // Secrets are write-only: a blank field means "keep what is saved".
  const whatsappToken = input.whatsappToken || existing.whatsappToken;
  const aiApiKey = input.aiApiKey || existing.aiApiKey;
  if (input.whatsappEnabled) {
    if (!input.whatsappPhoneId)
      throw codedError('Add the WhatsApp phone number id', 'AUTOMATION_INVALID');
    if (!whatsappToken) throw codedError('Add the WhatsApp access token', 'AUTOMATION_INVALID');
    if (!/^\+?[0-9]{7,20}$/.test(input.whatsappTo)) {
      throw codedError(
        'Add the recipient in international format, e.g. 2348012345678',
        'AUTOMATION_INVALID'
      );
    }
  }
  if (input.aiEnabled && !input.aiBaseUrl) {
    throw codedError('Add the AI endpoint URL', 'AUTOMATION_INVALID');
  }

  const timestamp = new Date();
  local.raw
    .prepare(
      `INSERT INTO automation_settings (
         business_id, whatsapp_enabled, whatsapp_phone_id, whatsapp_token, whatsapp_to,
         whatsapp_template, whatsapp_lang,
         ai_enabled, ai_base_url, ai_api_key, ai_model,
         low_stock_enabled, daily_summary_enabled, daily_summary_hour,
         last_low_stock_on, last_summary_on, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (business_id) DO UPDATE SET
         whatsapp_enabled = excluded.whatsapp_enabled,
         whatsapp_phone_id = excluded.whatsapp_phone_id,
         whatsapp_token = excluded.whatsapp_token,
         whatsapp_to = excluded.whatsapp_to,
         whatsapp_template = excluded.whatsapp_template,
         whatsapp_lang = excluded.whatsapp_lang,
         ai_enabled = excluded.ai_enabled,
         ai_base_url = excluded.ai_base_url,
         ai_api_key = excluded.ai_api_key,
         ai_model = excluded.ai_model,
         low_stock_enabled = excluded.low_stock_enabled,
         daily_summary_enabled = excluded.daily_summary_enabled,
         daily_summary_hour = excluded.daily_summary_hour,
         updated_at = excluded.updated_at`
    )
    .run(
      businessId,
      input.whatsappEnabled ? 1 : 0,
      input.whatsappPhoneId,
      whatsappToken,
      input.whatsappTo,
      input.whatsappTemplate,
      input.whatsappLang,
      input.aiEnabled ? 1 : 0,
      input.aiBaseUrl.replace(/\/+$/, ''),
      aiApiKey,
      input.aiModel || 'gpt-4o-mini',
      input.lowStockEnabled ? 1 : 0,
      input.dailySummaryEnabled ? 1 : 0,
      input.dailySummaryHour,
      existing.lastLowStockOn,
      existing.lastSummaryOn,
      Math.floor(timestamp.getTime() / 1000)
    );
  writeAuditSync(local, {
    businessId,
    userId,
    action: 'automation.configured',
    entity: 'automation',
    details: {
      whatsappEnabled: input.whatsappEnabled,
      aiEnabled: input.aiEnabled,
      lowStockEnabled: input.lowStockEnabled,
      dailySummaryEnabled: input.dailySummaryEnabled,
    },
  });
  return getAutomationSettings(local, businessId);
}

function toMessageView(row: typeof automationMessages.$inferSelect): AutomationMessage {
  return {
    id: row.id,
    kind: row.kind,
    channel: row.channel,
    toAddress: row.toAddress,
    body: row.body,
    status: row.status as AutomationMessageStatus,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

export async function listAutomationMessages(
  local: LocalDb,
  businessId: string,
  limit = 25
): Promise<AutomationMessage[]> {
  // Timestamps have one-second resolution, so rowid breaks ties between
  // messages queued in the same tick (newest first).
  const rows = local.raw
    .prepare(
      `SELECT * FROM automation_messages
        WHERE business_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?`
    )
    .all(businessId, Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    channel: String(row.channel),
    toAddress: String(row.to_address ?? ''),
    body: String(row.body),
    status: row.status as AutomationMessageStatus,
    error: String(row.error ?? ''),
    createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
    sentAt: row.sent_at ? new Date(Number(row.sent_at) * 1000).toISOString() : null,
  }));
}

function queueMessage(
  local: LocalDb,
  businessId: string,
  kind: string,
  body: string,
  toAddress: string
): AutomationMessage {
  const id = newId('msg');
  const timestamp = new Date();
  local.db
    .insert(automationMessages)
    .values({
      id,
      businessId,
      kind,
      channel: 'whatsapp',
      toAddress,
      body,
      status: 'queued',
      error: '',
      createdAt: timestamp,
      sentAt: null,
    })
    .run();
  // Keep the outbox small; it is a preview log, not a permanent archive.
  local.raw
    .prepare(
      `DELETE FROM automation_messages
        WHERE business_id = ?
          AND id NOT IN (
            SELECT id FROM automation_messages
             WHERE business_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
          )`
    )
    .run(businessId, businessId, OUTBOX_RETENTION);
  const row = local.db
    .select()
    .from(automationMessages)
    .where(eq(automationMessages.id, id))
    .limit(1)
    .get();
  return toMessageView(row!);
}

function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  const rounded = Math.round(naira * 100) / 100;
  return `₦${rounded.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dayStamp(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function countLowStock(local: LocalDb, businessId: string): number {
  const row = local.raw
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT p.id
           FROM products p
           LEFT JOIN stock_movements m ON m.product_id = p.id
          WHERE p.business_id = ? AND p.is_active = 1 AND p.reorder_level > 0
          GROUP BY p.id
         HAVING COALESCE(SUM(m.qty_delta), 0) <= p.reorder_level
       )`
    )
    .get(businessId) as { n: number };
  return row.n;
}

export function buildLowStockDigest(local: LocalDb, businessId: string): string | null {
  const rows = local.raw
    .prepare(
      `SELECT p.name, p.unit,
              COALESCE(SUM(m.qty_delta), 0) AS on_hand,
              p.reorder_level
         FROM products p
         LEFT JOIN stock_movements m ON m.product_id = p.id
        WHERE p.business_id = ? AND p.is_active = 1 AND p.reorder_level > 0
        GROUP BY p.id
       HAVING on_hand <= p.reorder_level
        ORDER BY on_hand ASC, p.name ASC
        LIMIT ?`
    )
    .all(businessId, LOW_STOCK_PREVIEW) as Array<{
    name: string;
    unit: string;
    on_hand: number;
    reorder_level: number;
  }>;
  if (rows.length === 0) return null;
  const count = countLowStock(local, businessId);
  const lines = rows.map(
    (row) => `• ${row.name}: ${row.on_hand} ${row.unit} left (reorder at ${row.reorder_level})`
  );
  const header = `Low stock alert — ${count} item${count === 1 ? '' : 's'} at or below reorder level`;
  const tail = count > rows.length ? `…and ${count - rows.length} more.` : '';
  return [header, '', ...lines, tail].filter((line) => line !== '').join('\n');
}

export function buildDailySummary(local: LocalDb, businessId: string, now = new Date()): string {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const summary = getReportsSummary(local, businessId, ['reports.view'], { from, to: now });
  const lowCount = countLowStock(local, businessId);
  const top = summary.topProducts[0];
  const dateLabel = now.toDateString();
  const lines = [
    `Daily summary — ${dateLabel}`,
    `Sales: ${formatNaira(summary.sales.grossKobo)} from ${summary.sales.transactions} receipt${
      summary.sales.transactions === 1 ? '' : 's'
    }`,
    `Gross profit: ${formatNaira(summary.sales.grossProfitKobo)}`,
  ];
  if (top) lines.push(`Top seller: ${top.name} ×${top.qty}`);
  lines.push(`Low stock: ${lowCount} item${lowCount === 1 ? '' : 's'}`);
  return lines.join('\n');
}

async function rewriteWithAi(
  settings: AutomationSettings,
  text: string,
  fetchImpl: typeof fetch
): Promise<string> {
  if (!settings.aiEnabled || !settings.aiBaseUrl) return text;
  try {
    const response = await fetchImpl(`${settings.aiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(settings.aiApiKey ? { authorization: `Bearer ${settings.aiApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: settings.aiModel || 'gpt-4o-mini',
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'You write short, friendly WhatsApp updates for a small shop owner in Nigeria. ' +
              'Keep the facts exactly as given, stay under 60 words, use plain language, no emojis.',
          },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return text;
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return text;
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : text;
  } catch {
    // The deterministic text is already good; AI is an enhancement only.
    return text;
  }
}

async function deliver(
  local: LocalDb,
  settings: AutomationSettings,
  message: AutomationMessage,
  fetchImpl: typeof fetch
): Promise<AutomationMessageStatus> {
  if (!settings.whatsappEnabled) {
    local.raw
      .prepare("UPDATE automation_messages SET status = 'dry_run' WHERE id = ?")
      .run(message.id);
    return 'dry_run';
  }
  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
        settings.whatsappPhoneId
      )}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${settings.whatsappToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          settings.whatsappTemplate
            ? {
                messaging_product: 'whatsapp',
                to: message.toAddress,
                type: 'template',
                template: {
                  name: settings.whatsappTemplate,
                  language: { code: settings.whatsappLang || 'en' },
                  components: [
                    { type: 'body', parameters: [{ type: 'text', text: message.body }] },
                  ],
                },
              }
            : {
                messaging_product: 'whatsapp',
                to: message.toAddress,
                type: 'text',
                text: { body: message.body },
              }
        ),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      let detail = '';
      try {
        const body = (await response.json()) as {
          error?: { message?: unknown };
        };
        if (body.error && typeof body.error.message === 'string')
          detail = `: ${body.error.message}`;
      } catch {
        // Non-JSON error bodies are fine; the status code is enough.
      }
      throw codedError(
        `WhatsApp rejected the message (${response.status})${detail}`,
        'AUTOMATION_SEND_FAILED'
      );
    }
    local.raw
      .prepare("UPDATE automation_messages SET status = 'sent', sent_at = ? WHERE id = ?")
      .run(Math.floor(Date.now() / 1000), message.id);
    return 'sent';
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'WhatsApp delivery failed';
    local.raw
      .prepare("UPDATE automation_messages SET status = 'failed', error = ? WHERE id = ?")
      .run(detail.slice(0, 500), message.id);
    return 'failed';
  }
}

function markRunDates(
  local: LocalDb,
  businessId: string,
  dates: { summaryOn?: string; lowStockOn?: string }
): void {
  if (dates.summaryOn !== undefined) {
    local.raw
      .prepare('UPDATE automation_settings SET last_summary_on = ? WHERE business_id = ?')
      .run(dates.summaryOn, businessId);
  }
  if (dates.lowStockOn !== undefined) {
    local.raw
      .prepare('UPDATE automation_settings SET last_low_stock_on = ? WHERE business_id = ?')
      .run(dates.lowStockOn, businessId);
  }
}

/**
 * Queue (and, when WhatsApp is on, send) any automation due right now. Safe to
 * call on a timer: the once-a-day guards live in `automation_settings`.
 */
export async function runAutomation(
  local: LocalDb,
  businessId: string,
  options: AutomationRunOptions = {}
): Promise<AutomationRunResult> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  const force = options.force === true;
  const settings = getAutomationSettings(local, businessId);
  const result: AutomationRunResult = { queued: 0, sent: 0, failed: 0, dryRun: 0, skipped: [] };

  if (!settings.lowStockEnabled && !settings.dailySummaryEnabled) {
    result.skipped.push('disabled');
    return result;
  }

  const today = dayStamp(now);
  const send = async (kind: string, text: string): Promise<void> => {
    const body = await rewriteWithAi(settings, text, fetchImpl);
    const message = queueMessage(local, businessId, kind, body, settings.whatsappTo);
    result.queued += 1;
    const status = await deliver(local, settings, message, fetchImpl);
    if (status === 'sent') result.sent += 1;
    else if (status === 'failed') result.failed += 1;
    else result.dryRun += 1;
  };

  if (settings.dailySummaryEnabled) {
    const due =
      force || (now.getHours() >= settings.dailySummaryHour && settings.lastSummaryOn !== today);
    if (due) {
      await send('daily_summary', buildDailySummary(local, businessId, now));
      markRunDates(local, businessId, { summaryOn: today });
    } else {
      result.skipped.push('daily_summary');
    }
  }

  if (settings.lowStockEnabled) {
    const due = force || settings.lastLowStockOn !== today;
    if (due) {
      const digest = buildLowStockDigest(local, businessId);
      if (digest) await send('low_stock', digest);
      markRunDates(local, businessId, { lowStockOn: today });
    } else {
      result.skipped.push('low_stock');
    }
  }

  return result;
}

export async function sendTestMessage(
  local: LocalDb,
  businessId: string,
  userId: string,
  grants: string[],
  raw: unknown,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<AutomationMessage> {
  requirePermission(new Set(grants), 'settings.manage');
  const input = automationTestSchema.parse(raw);
  const settings = getAutomationSettings(local, businessId);
  const message = queueMessage(local, businessId, 'test', input.body, settings.whatsappTo);
  await deliver(local, settings, message, options.fetchImpl ?? fetch);
  const row = local.db
    .select()
    .from(automationMessages)
    .where(eq(automationMessages.id, message.id))
    .limit(1)
    .get();
  return toMessageView(row!);
}
