import type { ZodError } from 'zod';
import { PaymentError } from './paystack';

export function jsonError(status: number, message: string, code: string): Response {
  return Response.json(
    { ok: false, error: message, message, code },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

export function validationError(error: ZodError): Response {
  return jsonError(400, error.issues[0]?.message ?? 'Invalid request', 'VALIDATION');
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PaymentError) {
    return jsonError(error.status, error.message, error.code);
  }
  console.error('checkout route failed:', error instanceof Error ? error.message : error);
  return jsonError(500, 'Something went wrong. Please try again.', 'INTERNAL');
}

export function isOrderReference(value: string): boolean {
  return /^ord_[0-9a-f]{24}$/.test(value);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
