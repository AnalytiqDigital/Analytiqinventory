import { randomBytes } from 'node:crypto';
import { findLicensePlan, type CheckoutInput } from '@analytiq/validation';
import { ApiError } from '../common/api-error';
import type { Order, OrderStore } from './order.store';

export interface SettleResult {
  /** Null when Paystack reports a reference this API never issued. */
  order: Order | null;
  alreadyPaid: boolean;
}

export class OrdersService {
  /** Serialises settlement so two webhook deliveries cannot issue two keys. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: OrderStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async create(input: CheckoutInput): Promise<Order> {
    const plan = findLicensePlan(input.plan);
    if (!plan) throw new ApiError(400, 'Choose a plan', 'VALIDATION');
    const order: Order = {
      reference: `ord_${randomBytes(12).toString('hex')}`,
      planId: plan.id,
      business: input.business,
      name: input.name,
      email: input.email,
      phone: input.phone,
      amountKobo: plan.priceKobo,
      status: 'pending',
      licenseKey: null,
      createdAt: this.now().toISOString(),
      paidAt: null,
    };
    await this.store.put(order);
    return order;
  }

  async get(reference: string): Promise<Order | undefined> {
    return this.store.get(reference);
  }

  /**
   * Marks a paid order and records the key produced by `issue`. The callback
   * runs only on the pending → paid transition, so redeliveries return the
   * original key instead of issuing (and potentially charging for) another.
   */
  settle(
    reference: string,
    issue: (order: Order) => string,
    validate?: (order: Order) => void
  ): Promise<SettleResult> {
    return this.exclusive(async () => {
      const order = await this.store.get(reference);
      if (!order) return { order: null, alreadyPaid: false };
      if (order.status === 'paid') return { order, alreadyPaid: true };
      validate?.(order);
      const licenseKey = issue(order);
      const paid: Order = {
        ...order,
        status: 'paid',
        licenseKey,
        paidAt: this.now().toISOString(),
      };
      await this.store.put(paid);
      return { order: paid, alreadyPaid: false };
    });
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
