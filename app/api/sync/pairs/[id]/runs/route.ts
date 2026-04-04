import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError, notFound } from '@/app/api/_shared/http';
import { getSyncPair, listSyncRunsForPair } from '@/lib/sync/syncStore';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';

/**
 * GET /api/sync/pairs/[id]/runs
 *
 * Returns the sync run history for a given pair.
 * Only returns runs for pairs owned by the authenticated user.
 *
 * Query params:
 *   limit - max runs to return (default 20, max 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();
    const { id } = await params;

    const pair = getSyncPair(id, getAllSessionUserIds(session));
    if (!pair) {
      return notFound('Sync pair not found');
    }

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

    const runs = listSyncRunsForPair(id, limit);
    return ok({ runs });
  } catch (error) {
    console.error('[api/sync/pairs/[id]/runs] GET Error:', error);
    return fromError(error);
  }
}
