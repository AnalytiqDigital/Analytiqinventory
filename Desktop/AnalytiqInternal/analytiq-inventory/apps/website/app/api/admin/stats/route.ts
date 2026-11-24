import { createHash, timingSafeEqual } from 'node:crypto';
import { fetchDashboardStats } from '../../../../lib/server/analytics';
import { loadWebConfig } from '../../../../lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' } as const;

function authorised(supplied: string, expected: string): boolean {
  const left = createHash('sha256').update(supplied).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.ADMIN_DASHBOARD_TOKEN?.trim() ?? '';
  if (!expected) {
    return Response.json(
      { ok: false, error: 'Admin dashboard is not configured. Set ADMIN_DASHBOARD_TOKEN.' },
      { status: 503, headers: NO_STORE }
    );
  }

  const supplied = request.headers.get('x-admin-token')?.trim() ?? '';
  if (!supplied || !authorised(supplied, expected)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  }

  try {
    const stats = await fetchDashboardStats(loadWebConfig());
    return Response.json({ ok: true, stats }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Could not load dashboard statistics',
      },
      { status: 502, headers: NO_STORE }
    );
  }
}
