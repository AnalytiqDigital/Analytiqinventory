import { activationSchema } from '@analytiq/validation';
import { checkActivationKey } from '../../../../lib/server/activationKey';
import { loadWebConfig } from '../../../../lib/server/config';
import { errorResponse, jsonError, readJson, validationError } from '../../../../lib/server/http';
import { releaseInRegistry } from '../../../../lib/server/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Releases the first-use binding so the key can be activated on another computer. */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = activationSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const check = checkActivationKey(parsed.data.key);
    if (!check.ok) return jsonError(check.status, check.message, check.code);
    const { payload } = check;

    if (payload.device) {
      if (payload.device !== parsed.data.installId) {
        return jsonError(
          403,
          'This key was issued for a different installation',
          'LICENSE_DEVICE_MISMATCH'
        );
      }
      return Response.json({ ok: true, state: 'released', licenceId: payload.id });
    }

    const binding = await releaseInRegistry(
      { licenceId: payload.id, installId: parsed.data.installId },
      loadWebConfig()
    );
    if (binding.state === 'taken') {
      return jsonError(
        409,
        'This key is activated on another computer, so it cannot be released from here.',
        'LICENSE_DEVICE_MISMATCH'
      );
    }
    return Response.json({ ok: true, state: binding.state, licenceId: payload.id });
  } catch (error) {
    return errorResponse(error);
  }
}
