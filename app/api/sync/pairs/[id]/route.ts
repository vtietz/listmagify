import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError, notFound, badRequest } from '@/app/api/_shared/http';
import { getSyncPair, deleteSyncPair, getLatestSyncRun, updateSyncPairAutoSync } from '@/lib/sync/syncStore';

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

/**
 * PATCH /api/sync/pairs/[id]
 *
 * Update auto-sync setting for a sync pair.
 * Only updates pairs owned by the authenticated user.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();
    const { id } = await params;
    const body = await request.json();

    if (typeof body.autoSync !== 'boolean') {
      return badRequest('autoSync must be a boolean');
    }

    const updated = updateSyncPairAutoSync(id, body.autoSync, session.user.id);
    if (!updated) {
      return notFound('Sync pair not found');
    }

    const pair = getSyncPair(id, session.user.id);
    const latestRun = pair ? getLatestSyncRun(pair.id) : null;
    return ok({ pair: pair ? { ...pair, latestRun } : null });
  } catch (error) {
    console.error('[api/sync/pairs/[id]] PATCH Error:', error);
    return fromError(error);
  }
}
