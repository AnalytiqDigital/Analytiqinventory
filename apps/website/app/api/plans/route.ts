import { licensePlans } from '@analytiq/validation';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(
    { ok: true, plans: licensePlans },
    { headers: { 'cache-control': 'no-store' } }
  );
}
