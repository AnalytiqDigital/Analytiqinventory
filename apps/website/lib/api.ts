import type { CheckoutInput, LeadInput } from '@analytiq/validation';
import type { OrderView } from './types';

export type { DeliveryAttempt, DeliveryRecord, OrderView } from './types';

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

/**
 * Blank means the API routes deployed with this site (`/api/...`). Set
 * NEXT_PUBLIC_API_URL to point the site at a separately hosted cloud API.
 */
export function apiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured ? configured.replace(/\/+$/, '') : '';
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

/** Key recovery needs both the order reference and the checkout email. */
export async function retrieveKey(reference: string, email: string): Promise<OrderView> {
  const body = await request<{ ok: true; order: OrderView }>('/api/licence/retrieve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reference, email }),
  });
  return body.order;
}

/**
 * Persist a demo/quote request server-side. The forms still open WhatsApp;
 * this call is fire-and-forget so a slow API never blocks the hand-off.
 */
export async function submitLead(input: LeadInput): Promise<string> {
  const body = await request<{ ok: true; id: string }>('/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return body.id;
}
