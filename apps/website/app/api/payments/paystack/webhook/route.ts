import { loadWebConfig } from '../../../../../lib/server/config';
import { deliverEmail, licenceEmail } from '../../../../../lib/server/delivery';
import { errorResponse, isOrderReference, jsonError } from '../../../../../lib/server/http';
import { isAnalytiqTransaction, issueFromTransaction } from '../../../../../lib/server/licences';
import { PaystackClient } from '../../../../../lib/server/paystack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PaystackEvent {
  event?: unknown;
  data?: { reference?: unknown };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const config = loadWebConfig();
    const paystack = new PaystackClient(config.paystackSecretKey);
    if (!paystack.configured) {
      return jsonError(503, 'Payments are not configured', 'PAYSTACK_NOT_CONFIGURED');
    }

    const raw = await request.text();
    if (!paystack.verifyWebhook(raw, request.headers.get('x-paystack-signature') ?? undefined)) {
      return jsonError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
    }

    let event: PaystackEvent;
    try {
      event = JSON.parse(raw) as PaystackEvent;
    } catch {
      return jsonError(400, 'Webhook body is not valid JSON', 'INVALID_PAYLOAD');
    }
    if (event.event !== 'charge.success') {
      return Response.json({ ok: true, ignored: true });
    }
    const reference = event.data?.reference;
    if (typeof reference !== 'string' || !isOrderReference(reference)) {
      return Response.json({ ok: true, ignored: true });
    }

    // Verify with Paystack rather than trusting the event body: this is also
    // what makes the key reproducible if the webhook is delivered twice.
    const transaction = await paystack.verify(reference);
    if (!transaction || !isAnalytiqTransaction(transaction) || transaction.status !== 'success') {
      return Response.json({ ok: true, ignored: true });
    }

    const { order } = issueFromTransaction(transaction, config.licensePrivateKeyPem);
    const website = config.websiteUrl || new URL(request.url).origin;
    // Delivery never fails the acknowledgement; the success page is canonical.
    const delivered = await deliverEmail(licenceEmail(order, website), config);

    return Response.json({ ok: true, status: 'paid', delivered });
  } catch (error) {
    return errorResponse(error);
  }
}
