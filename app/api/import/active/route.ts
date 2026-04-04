import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
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
    console.error('[api/import/active] Error:', error);
    return fromError(error);
  }
}
