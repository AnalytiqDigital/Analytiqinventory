import { loadWebConfig } from '../../../../lib/server/config';
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
    return Response.json(
      { ok: true, order: orderView(transaction, config.licensePrivateKeyPem) },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
