import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError, notFound } from '@/app/api/_shared/http';
import { getSyncPair, deleteSyncPair, getLatestSyncRun } from '@/lib/sync/syncStore';

/**
 * GET /api/sync/pairs/[id]
 *
 * Get a sync pair by ID, including its latest run information.
 * Only returns pairs owned by the authenticated user.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();

    const { id } = await params;
    const pair = getSyncPair(id, session.user.id);

    if (!pair) {
      return notFound('Sync pair not found');
    }

    const latestRun = getLatestSyncRun(id);

    return ok({ pair, latestRun });
  } catch (error) {
    console.error('[api/sync/pairs/[id]] GET Error:', error);
    return fromError(error);
  }
}

/**
 * DELETE /api/sync/pairs/[id]
 *
 * Delete a sync pair by ID.
 * Only deletes pairs owned by the authenticated user.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();

    const { id } = await params;
    const deleted = deleteSyncPair(id, session.user.id);

    if (!deleted) {
      return notFound('Sync pair not found');
    }

    return ok({ deleted: true });
  } catch (error) {
    console.error('[api/sync/pairs/[id]] DELETE Error:', error);
    return fromError(error);
  }
}
