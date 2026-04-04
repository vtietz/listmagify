import { NextRequest } from 'next/server';
import { assertAuthenticated } from '@/app/api/_shared/guard';
import { ok, badRequest, notFound, fromError } from '@/app/api/_shared/http';
import { getImportJobWithPlaylists } from '@/lib/import/importStore';
import { getAllSessionUserIds } from '@/lib/auth/sessionUserIds';

/**
 * GET /api/import/status?jobId=<id>
 *
 * Fetch the current status of an import job, including all playlist statuses.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await assertAuthenticated();

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return badRequest('Missing required query parameter: jobId');
    }

    const job = getImportJobWithPlaylists(jobId, getAllSessionUserIds(session));
    if (!job) {
      return notFound('Import job not found');
    }

    return ok({ job });
  } catch (error) {
    console.error('[api/import/status] Error:', error);
    return fromError(error);
  }
}
