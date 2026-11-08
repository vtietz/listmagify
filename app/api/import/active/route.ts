import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
import { isAppRouteError } from '@/lib/errors';
import { getActiveImportJob } from '@/lib/import/importStore';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';

/**
 * GET /api/import/active
 *
 * Check if the authenticated user has an active import job.
 */
export async function GET() {
  try {
    const session = await assertAuthenticated();
    const activeJob = getActiveImportJob(getAllSessionUserIds(session));
    return ok({ activeJob: activeJob ?? null });
  } catch (error) {
    // Missing session is expected (logged-out tabs, stale tabs after redeploy): answer 401 quietly.
    if (!(isAppRouteError(error) && error.status === 401)) {
      console.error('[api/import/active] Error:', error);
    }
    return fromError(error);
  }
}
