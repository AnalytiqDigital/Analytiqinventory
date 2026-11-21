import type { CloudConfig } from '../config';
import type { DeliveryRecord, Order } from '../orders/order.store';

type DeliveryConfig = Pick<
  CloudConfig,
  'websiteUrl' | 'resendApiKey' | 'emailFrom' | 'whatsappToken' | 'whatsappPhoneNumberId'
>;

export function whatsappRecipient(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Nigerian numbers are stored locally with a leading 0; wa.me needs 234.
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  return digits;
}

function emailText(order: Order, website: string): string {
  return [
    `Hi ${order.name || order.business},`,
    '',
    'Thank you for buying AnalytIQ Inventory & POS.',
    '',
    `Order reference: ${order.reference}`,
    'Licence key (paste it into Settings → Licence):',
    order.licenseKey ?? '',
    '',
    `Download: ${website}/download`,
    `Lost this email? Retrieve the key at ${website}/retrieve-key using the reference and this email address.`,
    '',
    'AnalytIQ Digital',
  ].join('\n');
}

function whatsappText(order: Order): string {
  return [
    `AnalytIQ licence — ${order.business}`,
    `Order: ${order.reference}`,
    `Key: ${order.licenseKey ?? ''}`,
    'Open the app → Settings → Licence and paste the key.',
  ].join('\n');
}

/**
 * Sends the issued key over the channels the buyer supplied. Failures are
 * recorded on the order instead of thrown: the webhook must still be
 * acknowledged, and the key is always recoverable from the website.
 */
export class LicenseDelivery {
  constructor(
    private readonly config: DeliveryConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async email(order: Order): Promise<'sent' | 'failed' | 'skipped'> {
    if (!this.config.resendApiKey || !this.config.emailFrom) return 'skipped';
    if (!order.email) return 'skipped';
    try {
      const response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.config.emailFrom,
          to: [order.email],
          subject: 'Your AnalytIQ licence key',
          text: emailText(order, this.config.websiteUrl),
        }),
      });
      return response.ok ? 'sent' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private async whatsapp(order: Order): Promise<'sent' | 'failed' | 'skipped'> {
    if (!this.config.whatsappToken || !this.config.whatsappPhoneNumberId) return 'skipped';
    const to = whatsappRecipient(order.phone);
    if (!to) return 'skipped';
    try {
      const response = await this.fetchImpl(
        `https://graph.facebook.com/v21.0/${this.config.whatsappPhoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.whatsappToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: false, body: whatsappText(order) },
          }),
        }
      );
      return response.ok ? 'sent' : 'failed';
    } catch {
      return 'failed';
    }
  }

  async deliver(order: Order): Promise<DeliveryRecord> {
    if (!order.licenseKey) return {};
    const at = this.now().toISOString();
    const record: DeliveryRecord = {};
    const emailState =
      order.delivery?.email?.state === 'sent' ? 'sent' : await this.email(order);
    record.email = { state: emailState, at };
    const whatsappState =
      order.delivery?.whatsapp?.state === 'sent' ? 'sent' : await this.whatsapp(order);
    record.whatsapp = { state: whatsappState, at };
    return record;
  }
}
