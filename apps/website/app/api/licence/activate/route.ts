import { activationSchema } from '@analytiq/validation';
import { checkActivationKey } from '../../../../lib/server/activationKey';
import { loadWebConfig } from '../../../../lib/server/config';
import { errorResponse, jsonError, readJson, validationError } from '../../../../lib/server/http';
import { activateInRegistry } from '../../../../lib/server/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = activationSchema.safeParse(await readJson(request));
    if (!parsed.success) return validationError(parsed.error);

    const check = checkActivationKey(parsed.data.key);
    if (!check.ok) return jsonError(check.status, check.message, check.code);
    const { payload } = check;

    // Keys issued with an explicit device already enforce themselves offline.
    if (payload.device) {
      if (payload.device !== parsed.data.installId) {
        return jsonError(
          403,
          'This key was issued for a different installation',
          'LICENSE_DEVICE_MISMATCH'
        );
      }
      return Response.json({ ok: true, state: 'active', licenceId: payload.id, boundAt: null });
    }

    const binding = await activateInRegistry(
      {
        licenceId: payload.id,
        installId: parsed.data.installId,
        business: payload.business,
        plan: payload.plan,
      },
      loadWebConfig()
    );
    if (binding.state === 'taken') {
      return jsonError(
        409,
        'This licence key is already activated on another computer. Deactivate it there first, or contact AnalytIQ support.',
        'LICENSE_IN_USE'
      );
    }
    return Response.json({
      ok: true,
      state: 'active',
      licenceId: payload.id,
      boundAt: binding.boundAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
