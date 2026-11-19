import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../common/api-error';

const API_BASE = 'https://api.paystack.co';

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
}

interface ApiEnvelope {
  status?: unknown;
  message?: unknown;
  data?: { authorization_url?: unknown; access_code?: unknown };
}

export function paystackSignature(rawBody: Buffer | string, secretKey: string): string {
  return createHmac('sha512', secretKey).update(rawBody).digest('hex');
}

/** True only when `signature` is the HMAC-SHA512 of `rawBody` under `secretKey`. */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  secretKey: string,
  signature: string | undefined
): boolean {
  if (!secretKey || !signature) return false;
  const expected = paystackSignature(rawBody, secretKey);
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export class PaystackClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    if (!this.configured) {
      throw new ApiError(
        503,
        'Online card payment is not configured yet. Contact AnalytIQ to complete the purchase.',
        'PAYSTACK_NOT_CONFIGURED'
      );
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}/transaction/initialize`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(502, 'Could not reach Paystack. Try again.', 'PAYSTACK_UNREACHABLE');
    }
    let body: ApiEnvelope = {};
    try {
      body = (await response.json()) as ApiEnvelope;
    } catch {
      // The status code still tells us the call failed.
    }
    if (!response.ok || body.status !== true) {
      const detail = typeof body.message === 'string' ? `: ${body.message}` : '';
      throw new ApiError(502, `Paystack refused the payment${detail}`, 'PAYSTACK_ERROR');
    }
    const authorizationUrl = body.data?.authorization_url;
    const accessCode = body.data?.access_code;
    if (typeof authorizationUrl !== 'string' || typeof accessCode !== 'string') {
      throw new ApiError(502, 'Paystack returned an unexpected response', 'PAYSTACK_ERROR');
    }
    return { authorizationUrl, accessCode };
  }

  verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
    return verifyPaystackSignature(rawBody, this.secretKey, signature);
  }
}
