import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  checkoutSchema,
  findLicensePlan,
  licensePlans,
  retrieveKeySchema,
} from '@analytiq/validation';
import { ApiError, parseInput } from './common/api-error';
import { CLOUD_CONFIG, type CloudConfig } from './config';
import type { Order } from './orders/order.store';
import { OrdersService } from './orders/orders.service';
import { PaystackClient } from './payments/paystack';

export function orderView(order: Order): Record<string, unknown> {
  return {
    reference: order.reference,
    planId: order.planId,
    planName: findLicensePlan(order.planId)?.name ?? order.planId,
    business: order.business,
    name: order.name,
    email: order.email,
    amountKobo: order.amountKobo,
    status: order.status,
    // Ready to copy only after Paystack confirms the payment.
    licenseKey: order.status === 'paid' ? order.licenseKey : null,
    delivery: order.delivery ?? null,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

@Controller('api')
export class CheckoutController {
  constructor(
    private readonly orders: OrdersService,
    private readonly paystack: PaystackClient,
    @Inject(CLOUD_CONFIG) private readonly config: CloudConfig
  ) {}

  @Get('plans')
  plans(): Record<string, unknown> {
    return { ok: true, plans: licensePlans };
  }

  @Post('checkout')
  async checkout(@Body() body: unknown): Promise<Record<string, unknown>> {
    const input = parseInput(checkoutSchema, body);
    const order = await this.orders.create(input);
    const payment = await this.paystack.initialize({
      email: order.email,
      amountKobo: order.amountKobo,
      reference: order.reference,
      callbackUrl: `${this.config.websiteUrl}/checkout/success`,
      metadata: {
        order_reference: order.reference,
        plan: order.planId,
        business: order.business,
      },
    });
    return { ok: true, order: orderView(order), authorizationUrl: payment.authorizationUrl };
  }

  @Get('checkout/:reference')
  async status(@Param('reference') reference: string): Promise<Record<string, unknown>> {
    const order = await this.orders.get(reference);
    if (!order) throw new ApiError(404, 'That order does not exist', 'ORDER_NOT_FOUND');
    return { ok: true, order: orderView(order) };
  }

  /**
   * Key recovery. The reference is unguessable and must match the email used
   * at checkout; the same 404 covers unknown, unpaid and mismatched orders so
   * the endpoint cannot be used to test references.
   */
  @Post('licence/retrieve')
  async retrieve(@Body() body: unknown): Promise<Record<string, unknown>> {
    const input = parseInput(retrieveKeySchema, body);
    const order = await this.orders.get(input.reference);
    if (
      !order ||
      order.status !== 'paid' ||
      !order.licenseKey ||
      order.email.toLowerCase() !== input.email
    ) {
      throw new ApiError(
        404,
        'We could not find a paid order with that reference and email',
        'ORDER_NOT_FOUND'
      );
    }
    return { ok: true, order: orderView(order) };
  }
}
