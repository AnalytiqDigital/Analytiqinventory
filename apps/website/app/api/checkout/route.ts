import { randomBytes } from 'node:crypto';
import { checkoutSchema, findLicensePlan } from '@analytiq/validation';
import { loadWebConfig } from '../../../lib/server/config';
import { errorResponse, jsonError, readJson, validationError } from '../../../lib/server/http';
import { PaystackClient } from '../../../lib/server/paystack';
import type { OrderView } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = checkoutSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const input = parsed.data;
    const plan = findLicensePlan(input.plan);
    if (!plan) return jsonError(400, 'Choose a plan', 'VALIDATION');

    const config = loadWebConfig();
    const reference = `ord_${randomBytes(12).toString('hex')}`;
    const website = config.websiteUrl || new URL(request.url).origin;
    const payment = await new PaystackClient(config.paystackSecretKey).initialize({
      email: input.email,
      amountKobo: plan.priceKobo,
      reference,
      callbackUrl: `${website}/checkout/success`,
      metadata: {
        order_reference: reference,
        plan: plan.id,
        business: input.business,
        name: input.name,
        email: input.email,
        phone: input.phone,
        amountKobo: plan.priceKobo,
        licenceDays: plan.days,
      },
    });

    const order: OrderView = {
      reference,
      planId: plan.id,
      planName: plan.name,
      business: input.business,
      name: input.name,
      email: input.email,
      amountKobo: plan.priceKobo,
      status: 'pending',
      licenseKey: null,
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    return Response.json({ ok: true, order, authorizationUrl: payment.authorizationUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
