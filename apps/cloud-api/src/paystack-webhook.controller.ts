import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiError } from './common/api-error';
import { LicenseIssuer } from './licensing/license-issuer';
import type { Order } from './orders/order.store';
import { OrdersService } from './orders/orders.service';
import { PaystackClient } from './payments/paystack';

interface RawBodyRequest {
  rawBody?: Buffer;
}

interface PaystackEvent {
  event?: unknown;
  data?: {
    reference?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
  };
}

@Controller('api/payments')
export class PaystackWebhookController {
  constructor(
    private readonly orders: OrdersService,
    private readonly issuer: LicenseIssuer,
    private readonly paystack: PaystackClient
  ) {}

  /**
   * Paystack signs the raw request body with HMAC-SHA512 and the secret key.
   * The matching is constant-time, and the license is issued inside the
   * service's settlement lock, so duplicate deliveries return the same key.
   */
  @Post('paystack/webhook')
  @HttpCode(200)
  async handle(
    @Req() request: RawBodyRequest,
    @Headers('x-paystack-signature') signature: string | undefined
  ): Promise<Record<string, unknown>> {
    if (!this.paystack.configured) {
      throw new ApiError(503, 'Payments are not configured', 'PAYSTACK_NOT_CONFIGURED');
    }
    const raw = request.rawBody;
    if (!raw || !this.paystack.verifyWebhook(raw, signature)) {
      throw new ApiError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
    }

    let event: PaystackEvent;
    try {
      event = JSON.parse(raw.toString('utf8')) as PaystackEvent;
    } catch {
      throw new ApiError(400, 'Webhook body is not valid JSON', 'INVALID_PAYLOAD');
    }

    if (event.event !== 'charge.success') {
      return { ok: true, ignored: true };
    }
    const reference = event.data?.reference;
    if (typeof reference !== 'string' || reference.length === 0) {
      throw new ApiError(400, 'Webhook has no payment reference', 'INVALID_PAYLOAD');
    }
    const data = event.data ?? {};

    const settled = await this.orders.settle(
      reference,
      (order: Order) => this.issuer.issue(order),
      (order: Order) => {
        if (typeof data.amount === 'number' && data.amount < order.amountKobo) {
          throw new ApiError(400, 'The paid amount does not match the order', 'AMOUNT_MISMATCH');
        }
        if (typeof data.currency === 'string' && data.currency !== 'NGN') {
          throw new ApiError(400, 'This order is priced in NGN', 'CURRENCY_MISMATCH');
        }
      }
    );

    // Unknown references are acknowledged so Paystack stops retrying; they may
    // belong to another integration sharing the account.
    if (!settled.order) return { ok: true, ignored: true };
    return {
      ok: true,
      status: settled.order.status,
      alreadyPaid: settled.alreadyPaid,
    };
  }
}
