import { createHmac, timingSafeEqual } from 'node:crypto';

const API_BASE = 'https://api.paystack.co';

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface PaystackTransaction {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  transaction_date: string | null;
  customer?: { email?: string } | null;
  metadata?: unknown;
}

interface ApiEnvelope {
  status?: unknown;
  message?: unknown;
  data?: {
    authorization_url?: unknown;
    reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    paid_at?: unknown;
    transaction_date?: unknown;
    customer?: unknown;
    metadata?: unknown;
  };
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

  private assertConfigured(): void {
    if (!this.configured) {
      throw new PaymentError(
        'Online card payment is not configured yet. Contact AnalytIQ to complete the purchase.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }
  }

  private async call(path: string, init: RequestInit): Promise<{ response: Response; body: ApiEnvelope }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          accept: 'application/json',
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new PaymentError('Could not reach Paystack. Try again.', 502, 'PAYSTACK_UNREACHABLE');
    }
    let body: ApiEnvelope = {};
    try {
      body = (await response.json()) as ApiEnvelope;
    } catch {
      // The status code still tells us the call failed.
    }
    return { response, body };
  }

  async initialize(input: InitializeInput): Promise<{ authorizationUrl: string }> {
    this.assertConfigured();
    const { response, body } = await this.call('/transaction/initialize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (!response.ok || body.status !== true) {
      const detail = typeof body.message === 'string' ? `: ${body.message}` : '';
      throw new PaymentError(`Paystack refused the payment${detail}`, 502, 'PAYSTACK_ERROR');
    }
    const authorizationUrl = body.data?.authorization_url;
    if (typeof authorizationUrl !== 'string') {
      throw new PaymentError('Paystack returned an unexpected response', 502, 'PAYSTACK_ERROR');
    }
    return { authorizationUrl };
  }

  /** Returns null when Paystack has no transaction with that reference. */
  async verify(reference: string): Promise<PaystackTransaction | null> {
    this.assertConfigured();
    const { response, body } = await this.call(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET' }
    );
    if (response.status === 404) return null;
    if (!response.ok || body.status !== true || !body.data) {
      const detail = typeof body.message === 'string' ? `: ${body.message}` : '';
      throw new PaymentError(`Paystack could not confirm the payment${detail}`, 502, 'PAYSTACK_ERROR');
    }
    const data = body.data;
    if (typeof data.reference !== 'string' || typeof data.status !== 'string') {
      throw new PaymentError('Paystack returned an unexpected response', 502, 'PAYSTACK_ERROR');
    }
    const customer =
      data.customer && typeof data.customer === 'object'
        ? (data.customer as { email?: unknown })
        : null;
    return {
      reference: data.reference,
      status: data.status,
      amount: typeof data.amount === 'number' ? data.amount : 0,
      currency: typeof data.currency === 'string' ? data.currency : '',
      paid_at: typeof data.paid_at === 'string' ? data.paid_at : null,
      transaction_date:
        typeof data.transaction_date === 'string' ? data.transaction_date : null,
      customer: customer
        ? { email: typeof customer.email === 'string' ? customer.email : undefined }
        : null,
      metadata: data.metadata,
    };
  }

  verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
    return verifyPaystackSignature(rawBody, this.secretKey, signature);
  }
}
