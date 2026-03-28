import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
import { getLatestSyncRun } from '@/lib/sync/syncStore';

/**
 * GET /api/sync/status/[id]
 *
 * Get the latest sync run for a given sync pair ID.
 * Returns `{ run: SyncRun | null }`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await assertAuthenticated();

    const { id } = await params;
    const run = getLatestSyncRun(id);

    return ok({ run });
  } catch (error) {
    console.error('[api/sync/status/[id]] GET Error:', error);
    return fromError(error);
  }
}
