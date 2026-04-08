import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { badRequest, ok, fromError } from '@/app/api/_shared/http';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { getSyncPreviewRun, requestCancelSyncPreviewRun } from '@/lib/sync/previewStore';

/**
 * GET /api/sync/preview/[id]
 *
 * Returns async preview run status and result (when available).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();
    const { id } = await params;

    const payload = getSyncPreviewRun(id, getAllSessionUserIds(session));
    if (!payload) {
      return ok({ run: null, result: null });
    }

    return ok(payload);
  } catch (error) {
    console.error('[api/sync/preview/[id]] GET Error:', error);
    return fromError(error);
  }
}

/**
 * DELETE /api/sync/preview/[id]
 *
 * Requests cancellation for an in-flight preview run owned by the current user.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await assertAuthenticated();
    const { id } = await params;

    const canceled = requestCancelSyncPreviewRun(id, getAllSessionUserIds(session));
    if (!canceled) {
      return badRequest('Preview run is not cancelable or was not found.');
    }

    return ok({ canceled: true });
  } catch (error) {
    console.error('[api/sync/preview/[id]] DELETE Error:', error);
    return fromError(error);
  }
}
