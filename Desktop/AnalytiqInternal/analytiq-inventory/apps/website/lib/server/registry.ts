import type { WebConfig } from './config';
import { PaymentError } from './paystack';

/**
 * One key, one computer. The signed key alone cannot tell the vendor whether it
 * is already in use, so the first successful activation records
 * licence id → install id in a Google Sheet (via Apps Script). Later attempts
 * from another install id are refused. The sheet is also the support console:
 * clearing a row releases the key.
 */

export interface ActivationBinding {
  state: 'bound' | 'taken' | 'released' | 'unbound';
  boundAt: string | null;
}
interface RegistryBody {
  ok?: boolean;
  state?: string;
  boundAt?: unknown;
  error?: unknown;
}

async function callRegistry(
  config: WebConfig,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch
): Promise<RegistryBody> {
  if (!config.appsScriptUrl || !config.appsScriptSecret) {
    throw new PaymentError(
      'Activation is temporarily unavailable. Message AnalytIQ on WhatsApp.',
      503,
      'ACTIVATION_UNAVAILABLE'
    );
  }
  let response: Response;
  try {
    // Apps Script answers /exec with a redirect to the script output; following
    // it returns the JSON body.
    response = await fetchImpl(config.appsScriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: config.appsScriptSecret, ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymentError(
      'The activation service is unreachable. Try again in a moment.',
      503,
      'ACTIVATION_UNAVAILABLE'
    );
  }
  if (!response.ok) {
    throw new PaymentError(
      'The activation service is unreachable. Try again in a moment.',
      502,
      'ACTIVATION_UNAVAILABLE'
    );
  }
  let body: RegistryBody;
  try {
    body = (await response.json()) as RegistryBody;
  } catch {
    throw new PaymentError(
      'The activation service returned an unexpected answer. Try again or contact support.',
      502,
      'ACTIVATION_UNAVAILABLE'
    );
  }
  if (!body || body.ok !== true) {
    throw new PaymentError(
      typeof body?.error === 'string' && body.error
        ? body.error
        : 'The activation service returned an unexpected answer. Try again or contact support.',
      502,
      'ACTIVATION_UNAVAILABLE'
    );
  }
  return body;
}

function boundAtOf(body: RegistryBody): string | null {
  return typeof body.boundAt === 'string' && body.boundAt ? body.boundAt : null;
}

export async function activateInRegistry(
  input: { licenceId: string; installId: string; business: string; plan: string },
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ActivationBinding> {
  const body = await callRegistry(
    config,
    {
      action: 'activate',
      licenceId: input.licenceId,
      installId: input.installId,
      business: input.business,
      plan: input.plan,
    },
    fetchImpl
  );
  return body.state === 'taken'
    ? { state: 'taken', boundAt: boundAtOf(body) }
    : { state: 'bound', boundAt: boundAtOf(body) };
}

export async function releaseInRegistry(
  input: { licenceId: string; installId: string },
  config: WebConfig,
  fetchImpl: typeof fetch = fetch
): Promise<ActivationBinding> {
  const body = await callRegistry(
    config,
    { action: 'deactivate', licenceId: input.licenceId, installId: input.installId },
    fetchImpl
  );
  const state = body.state === 'taken' ? 'taken' : body.state === 'released' ? 'released' : 'unbound';
  return { state, boundAt: boundAtOf(body) };
}
