import { randomBytes } from 'node:crypto';
import { leadSchema } from '@analytiq/validation';
import { loadWebConfig } from '../../../lib/server/config';
import { deliverLead } from '../../../lib/server/delivery';
import { errorResponse, readJson, validationError } from '../../../lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = leadSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const stored = await deliverLead(parsed.data, loadWebConfig());
    return Response.json({ ok: true, id: `lead_${randomBytes(8).toString('hex')}`, stored });
  } catch (error) {
    return errorResponse(error);
  }
}
