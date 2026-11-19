import { HttpException } from '@nestjs/common';
import type { z, ZodTypeAny } from 'zod';

/**
 * Error body shape shared with the desktop/LAN API: `{ ok, error, code }`.
 * `message` is duplicated because Nest reads `response.message` for logging.
 */
export class ApiError extends HttpException {
  constructor(status: number, message: string, code: string) {
    super({ ok: false, error: message, message, code }, status);
  }
}

export function parseInput<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message ?? 'Invalid request';
  throw new ApiError(400, message, 'VALIDATION');
}
