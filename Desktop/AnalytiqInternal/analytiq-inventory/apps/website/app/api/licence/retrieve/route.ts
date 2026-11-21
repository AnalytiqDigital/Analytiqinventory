import { retrieveKeySchema } from '@analytiq/validation';
import { loadWebConfig } from '../../../../lib/server/config';
import {
  errorResponse,
  isOrderReference,
  jsonError,
  readJson,
  validationError,
} from '../../../../lib/server/http';
import { retrieveFromTransaction } from '../../../../lib/server/licences';
import { PaystackClient } from '../../../../lib/server/paystack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = retrieveKeySchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const { reference, email } = parsed.data;
    if (!isOrderReference(reference)) {
      return jsonError(404, 'That order does not exist', 'ORDER_NOT_FOUND');
    }
    const config = loadWebConfig();
    const transaction = await new PaystackClient(config.paystackSecretKey).verify(reference);
    if (!transaction) {
      return jsonError(404, 'That order does not exist', 'ORDER_NOT_FOUND');
    }
    return Response.json({
      ok: true,
      order: retrieveFromTransaction(transaction, config.licensePrivateKeyPem, email),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
