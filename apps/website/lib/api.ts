import type { CheckoutInput, LicensePlanId } from '@analytiq/validation';

export interface OrderView {
  reference: string;
  planId: LicensePlanId;
  planName: string;
  business: string;
  name: string;
  email: string;
  amountKobo: number;
  status: 'pending' | 'paid' | 'failed';
  licenseKey: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface CheckoutResponse {
  order: OrderView;
  authorizationUrl: string;
}

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export function apiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3002';
  return configured.replace(/\/+$/, '');
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
  code?: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      ...init,
      headers: { accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new CheckoutError(
      'We could not reach the payment server. Check your connection and try again.',
      0,
      'NETWORK'
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // A body-less error response still carries a status code.
  }

  if (!response.ok) {
    const detail = (body ?? {}) as ErrorBody;
    const message =
      typeof detail.error === 'string'
        ? detail.error
        : typeof detail.message === 'string'
          ? detail.message
          : 'Something went wrong. Please try again.';
    const code = typeof detail.code === 'string' ? detail.code : 'UNKNOWN';
    throw new CheckoutError(message, response.status, code);
  }
  return body as T;
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResponse> {
  const body = await request<{ ok: true; order: OrderView; authorizationUrl: string }>(
    '/api/checkout',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return { order: body.order, authorizationUrl: body.authorizationUrl };
}

export async function fetchOrder(reference: string): Promise<OrderView> {
  const body = await request<{ ok: true; order: OrderView }>(
    `/api/checkout/${encodeURIComponent(reference)}`
  );
  return body.order;
}
