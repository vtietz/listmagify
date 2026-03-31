import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, fromError } from '@/app/api/_shared/http';
import { getImportHistory, getActiveImportJob } from '@/lib/import/importStore';
import { NextRequest } from 'next/server';

/**
 * GET /api/import/history?limit=20
 *
 * Fetch recent import jobs for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await assertAuthenticated();
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, Number(limitParam)), 50) : 20;

    const jobs = getImportHistory(session.user.id, limit);
    const activeJob = getActiveImportJob(session.user.id);

    return ok({ jobs, activeJobId: activeJob?.id ?? null });
  } catch (error) {
    console.error('[api/import/history] Error:', error);
    return fromError(error);
  }
}
