import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';
import { getSyncPreviewRun } from '@/lib/sync/previewStore';

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
