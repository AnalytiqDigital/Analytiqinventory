import { loadWebConfig } from '../../../../lib/server/config';
import { locationFromHeaders, recordPaidOrder } from '../../../../lib/server/delivery';
import { errorResponse, isOrderReference, jsonError } from '../../../../lib/server/http';
import { orderView } from '../../../../lib/server/licences';
import { PaystackClient } from '../../../../lib/server/paystack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { reference: string } }
): Promise<Response> {
  try {
    const { reference } = params;
    if (!isOrderReference(reference)) {
      return jsonError(404, 'That order does not exist', 'ORDER_NOT_FOUND');
    }
    const config = loadWebConfig();
    const transaction = await new PaystackClient(config.paystackSecretKey).verify(reference);
    if (!transaction) {
      return jsonError(404, 'That order does not exist', 'ORDER_NOT_FOUND');
    }
    const order = orderView(transaction, config.licensePrivateKeyPem);
    if (order.status === 'paid') {
      // Idempotent by reference, so a missed webhook and repeated polling are safe.
      await recordPaidOrder(order, locationFromHeaders(_request.headers), config);
    }
    return Response.json({ ok: true, order }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
