import type { OrderView } from '../types';
import type { WebConfig } from './config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type DeliveryState = 'sent' | 'failed' | 'skipped';

export function licenceEmail(order: OrderView, website: string): MailMessage {
  return {
    to: order.email,
    subject: 'Your AnalytIQ licence key',
    text: [
      `Hi ${order.name || order.business},`,
      '',
      'Thank you for buying AnalytIQ Inventory & POS.',
      '',
      `Order reference: ${order.reference}`,
      `Licence key (paste it into Settings → Licence):`,
      order.licenseKey ?? '',
      '',
      'Activate it once with an internet connection: the key locks to that computer, then keeps working offline.',
      `Download: ${website}/download`,
      `Lost this email? Retrieve the key at ${website}/retrieve-key using the reference and this email address.`,
      '',
      'AnalytIQ Digital',
    ].join('\n'),
  };
}

async function postAppsScript(
  config: WebConfig,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<boolean> {
  try {
    const response = await fetchImpl(config.appsScriptUrl, {
      method: 'POST',
      // Apps Script's POST answers with a 302 to the execution result. Stop at
      // the redirect: the script has already run, and following it drops the body.
      redirect: 'manual',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: config.appsScriptSecret, ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

/**
 * Apps Script sends from the vendor's Gmail address, so no domain or Resend
 * account is needed. Resend remains the fallback when it is configured.
 */
export async function deliverEmail(
  message: MailMessage,
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): Promise<DeliveryState> {
  if (!message.to) return 'skipped';
  if (config.appsScriptUrl && config.appsScriptSecret) {
    return (await postAppsScript(config, { action: 'email', ...message }, fetchImpl))
      ? 'sent'
      : 'failed';
  }
  if (config.resendApiKey && config.emailFrom) {
    try {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return response.ok ? 'sent' : 'failed';
    } catch {
      return 'failed';
    }
  }
  return 'skipped';
}

/** Demo and quote requests are appended to a Google Sheet and emailed by the script. */
export async function deliverLead(
  lead: Record<string, unknown>,
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!config.appsScriptUrl || !config.appsScriptSecret) return false;
  return postAppsScript(config, { action: 'lead', lead }, fetchImpl);
}
